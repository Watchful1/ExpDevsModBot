import { isLiveMode } from '../../config';
import { logFeatureAction } from '../../core/logging';
import { removePostByUs } from '../../core/reddit-helpers';
import type { ResolvedSettings } from '../../core/settings';
import {
  ensureSticky,
  initialStickyStateForPost,
} from '../../core/sticky';
import type {
  DispatchContext,
  FeatureResult,
  PostSubmitInput,
} from '../types';

/**
 * The AI gate feature's PostSubmit handler. Owns the Track A sticky's initial
 * state. Two-pronged behavior:
 *
 *   - AI gate ON: remove the post and place an `awaiting-ai` sticky. The
 *     comment-submit handler re-approves when OP replies to the sticky.
 *   - AI gate OFF, but flair-required ON: don't remove; just place a
 *     `flair-psa` sticky as a community PSA for would-be commenters.
 *   - AI gate OFF, flair-required OFF or shadow: nothing.
 *
 * This is grouped here (rather than in a dedicated "sticky-init" feature)
 * because the AI gate logically owns the multipurpose sticky.
 */
export async function run(
  input: PostSubmitInput,
  settings: ResolvedSettings,
  ctx: DispatchContext
): Promise<FeatureResult> {
  if (ctx.alreadyRemoved) {
    // A prior feature already removed the post; don't sticky.
    return { removed: false };
  }

  const aiGateOn = isLiveMode(settings.aiGateMode);
  // The flair PSA targets *commenters*, so key off the comment-flair setting.
  const flairOn = isLiveMode(settings.flairCommentMode);
  const desired = initialStickyStateForPost({ aiGateOn, flairOn });
  if (!desired) {
    return { removed: false };
  }

  if (desired === 'awaiting-ai') {
    await removePostByUs(input.postId);
    await ensureSticky(input.postId, 'awaiting-ai');
    logFeatureAction({
      feature: 'ai-gate',
      mode: settings.aiGateMode,
      action: 'remove-post',
      postId: input.postId,
      authorName: input.authorName,
      reason: 'awaiting AI disclosure',
    });
    logFeatureAction({
      feature: 'ai-gate',
      mode: settings.aiGateMode,
      action: 'sticky',
      postId: input.postId,
      reason: 'created awaiting-ai sticky',
    });
    return { removed: true };
  }

  // desired === 'flair-psa'
  await ensureSticky(input.postId, 'flair-psa');
  logFeatureAction({
    feature: 'ai-gate',
    mode: settings.flairCommentMode,
    action: 'sticky',
    postId: input.postId,
    reason: 'created flair-psa sticky (AI gate off)',
  });
  return { removed: false };
}
