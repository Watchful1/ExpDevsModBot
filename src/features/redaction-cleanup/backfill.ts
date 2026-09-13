import { context, reddit } from '@devvit/web/server';
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
  /** True if we hit REDACTION_BACKFILL_MAX_ITEMS before exhausting the listing. */
  truncated: boolean;
};

/**
 * One-shot sweep of the subreddit's "edited" mod listing, applying the same
 * decide/apply path as the CommentUpdate trigger. Intended for the mod menu:
 * it clears the backlog that accumulated before the trigger was live, and
 * catches anything the trigger dropped.
 *
 * Bounded by REDACTION_BACKFILL_MAX_ITEMS so a large listing can't blow the
 * menu handler's execution window; the result says whether it was cut off.
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

  const listing = reddit.getEdited({
    subreddit,
    type: 'comment',
    limit: 100,
  });

  for await (const comment of listing) {
    if (result.scanned >= REDACTION_BACKFILL_MAX_ITEMS) {
      result.truncated = true;
      break;
    }
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
    if (decision.kind !== 'remove') continue;

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

  console.log(
    `[modbot] redaction-cleanup backfill mode=${settings.redactionMode} ${JSON.stringify(result)}`
  );
  return result;
}
