import { reddit } from '@devvit/web/server';
import { isShadowMode } from '../../config';
import { logFeatureAction } from '../../core/logging';
import { withGrpcRetry } from '../../core/reddit-helpers';
import type { ResolvedSettings } from '../../core/settings';
import type { FeatureResult, RedactionCandidate } from '../types';
import { matchSignature, parseSignatures, type ParsedSignatures } from './signatures';

export type Decision =
  | { kind: 'noop'; reason: string }
  | { kind: 'remove'; signature: string; reason: string };

/**
 * Compile the signature setting once per call site. Invalid lines are
 * logged here (not in parseSignatures) so the pure function stays silent
 * and the warning carries the [modbot] prefix.
 */
export function compileSignatures(settings: ResolvedSettings): ParsedSignatures {
  const parsed = parseSignatures(settings.redactionSignatures);
  if (parsed.invalid.length > 0) {
    console.warn(
      `[modbot] redaction-cleanup: skipping ${parsed.invalid.length} invalid signature line(s): ${JSON.stringify(parsed.invalid)}`
    );
  }
  return parsed;
}

/**
 * Pure decision. Mod / app-account exemptions are the dispatcher's job.
 * `signatures` is passed in (rather than parsed here) so backfill can compile
 * once and reuse across hundreds of comments.
 */
export function decide(
  candidate: RedactionCandidate,
  settings: ResolvedSettings,
  signatures: ParsedSignatures
): Decision {
  if (settings.redactionMode === 'off') {
    return { kind: 'noop', reason: 'feature off' };
  }
  if (signatures.patterns.length === 0) {
    return { kind: 'noop', reason: 'no valid signatures configured' };
  }
  const hit = matchSignature(candidate.body, signatures.patterns);
  if (hit === null) {
    return { kind: 'noop', reason: 'body matches no signature' };
  }
  return {
    kind: 'remove',
    signature: hit,
    reason: `body matches redaction signature /${hit}/`,
  };
}

export async function apply(
  decision: Decision,
  candidate: RedactionCandidate,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  if (decision.kind === 'noop') {
    return { removed: false };
  }

  const logArgs = {
    feature: 'redaction-cleanup' as const,
    mode: settings.redactionMode,
    action: 'remove-comment' as const,
    postId: candidate.postId,
    commentId: candidate.commentId,
    authorName: candidate.authorName,
    reason: decision.reason,
    extra: { signature: decision.signature },
  };

  if (isShadowMode(settings.redactionMode)) {
    logFeatureAction(logArgs);
    return { removed: false };
  }

  // live: mode === 'on' or 'on+'
  try {
    const comment = await withGrpcRetry(
      () => reddit.getCommentById(candidate.commentId as `t1_${string}`),
      'redaction-cleanup:getCommentById'
    );
    await withGrpcRetry(() => comment.remove(), 'redaction-cleanup:remove');
  } catch (err) {
    console.warn(
      `[modbot] redaction-cleanup: failed to remove commentId=${candidate.commentId}`,
      err
    );
    return { removed: false };
  }
  logFeatureAction(logArgs);
  return { removed: true };
}

export async function run(
  candidate: RedactionCandidate,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  const signatures = compileSignatures(settings);
  return apply(decide(candidate, settings, signatures), candidate, settings);
}
