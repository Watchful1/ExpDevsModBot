import { context, reddit } from '@devvit/web/server';
import type { Comment } from '@devvit/reddit';
import { REDACTION_BACKFILL_MAX_ITEMS } from '../../config';
import { getAppAccountUsername, isModerator } from '../../core/exemptions';
import type { ResolvedSettings } from '../../core/settings';
import type { RedactionCandidate } from '../types';
import { apply, compileSignatures, decide } from './on-comment-update';

export type BackfillResult = {
  scanned: number;
  matched: number;
  /** Actually removed (0 in shadow mode). */
  removed: number;
  /** Matched but already removed before we got there; not re-actioned. */
  alreadyRemoved: number;
  /** Author is a mod or the app account. */
  exempt: number;
  /** True if we hit REDACTION_BACKFILL_MAX_ITEMS before exhausting the sources. */
  truncated: boolean;
};

/** How many non-matching bodies to log when a sweep finds nothing. */
const ZERO_MATCH_SAMPLE = 3;

/**
 * One-shot sweep applying the same decide/apply path as the CommentUpdate
 * trigger. Intended for the mod menu: it clears the backlog that accumulated
 * before the trigger was live, and catches anything the trigger dropped.
 *
 * Sources, in order:
 *   1. The mod queue. Reddit's own link filter flags overwritten comments as
 *      "edited to include a link", so this is where the backlog actually
 *      sits — and clearing the queue is the point.
 *   2. The "edited" listing, for overwrites whose footer carries no link and
 *      so never hit the filter.
 * Comments seen in both are evaluated once.
 *
 * Bounded by REDACTION_BACKFILL_MAX_ITEMS across both sources so a large
 * queue can't blow the menu handler's execution window; the result says
 * whether it was cut off.
 */
export async function runBackfill(
  settings: ResolvedSettings
): Promise<BackfillResult> {
  const result: BackfillResult = {
    scanned: 0,
    matched: 0,
    removed: 0,
    alreadyRemoved: 0,
    exempt: 0,
    truncated: false,
  };

  const subreddit = context.subredditName;
  if (!subreddit) {
    console.warn('[modbot] redaction-cleanup backfill: no subredditName in context');
    return result;
  }

  const signatures = compileSignatures(settings);
  const appSlug = getAppAccountUsername()?.toLowerCase();
  const seen = new Set<string>();
  const zeroMatchSamples: string[] = [];

  // `limit` on a Devvit Listing is the TOTAL cap, not the page size.
  const listingOpts = {
    subreddit,
    type: 'comment' as const,
    limit: REDACTION_BACKFILL_MAX_ITEMS,
    pageSize: 100,
  };
  const sources: Array<{ name: string; listing: AsyncIterable<Comment> }> = [
    { name: 'modqueue', listing: reddit.getModQueue(listingOpts) },
    { name: 'edited', listing: reddit.getEdited(listingOpts) },
  ];

  outer: for (const source of sources) {
    for await (const comment of source.listing) {
      if (result.scanned >= REDACTION_BACKFILL_MAX_ITEMS) {
        result.truncated = true;
        break outer;
      }
      if (seen.has(comment.id)) continue;
      seen.add(comment.id);
      result.scanned++;

      const author = comment.authorName;
      if (
        (appSlug && author.toLowerCase() === appSlug) ||
        (await isModerator(author))
      ) {
        result.exempt++;
        continue;
      }

      const candidate: RedactionCandidate = {
        commentId: comment.id,
        postId: comment.postId,
        authorName: author,
        body: comment.body,
      };
      const decision = decide(candidate, settings, signatures);
      if (decision.kind !== 'remove') {
        if (zeroMatchSamples.length < ZERO_MATCH_SAMPLE) {
          zeroMatchSamples.push(
            `${source.name}:${comment.id} ${JSON.stringify(comment.body.slice(0, 160))}`
          );
        }
        continue;
      }

      result.matched++;
      // Don't re-action (and re-log / re-mirror) comments a mod or a previous
      // sweep already removed.
      if (comment.removed) {
        result.alreadyRemoved++;
        continue;
      }
      const applied = await apply(decision, candidate, settings);
      if (applied.removed) result.removed++;
    }
  }

  console.log(
    `[modbot] redaction-cleanup backfill mode=${settings.redactionMode} ${JSON.stringify(result)}`
  );
  // If nothing matched, show what we were looking at so a signature
  // mismatch is diagnosable from the logs instead of a blank toast.
  if (result.matched === 0 && zeroMatchSamples.length > 0) {
    console.log(
      `[modbot] redaction-cleanup backfill: zero matches; sample bodies:\n  ${zeroMatchSamples.join('\n  ')}`
    );
  }
  return result;
}
