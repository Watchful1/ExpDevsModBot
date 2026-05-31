import { reddit } from '@devvit/web/server';
import type { T3 } from '@devvit/shared-types/tid.js';
import { isLiveMode } from '../../config';
import { logFeatureAction } from '../../core/logging';
import {
  approvePostById,
  wasRemovedByHumanMod,
  type PostLike,
} from '../../core/reddit-helpers';
import type { ResolvedSettings } from '../../core/settings';
import {
  getStickyState,
  nextStateAfterAiSatisfied,
  transitionSticky,
} from '../../core/sticky';
import type { CommentSubmitInput, FeatureResult } from '../types';

/**
 * Detects an OP reply to the Track A awaiting-ai sticky and unlocks the post.
 *
 * Preconditions handled here (not by the dispatcher):
 *   - comment.parentId matches the sticky's comment id
 *   - comment author is the post's author (OP)
 *
 * Idempotency: once the sticky has transitioned out of `awaiting-ai`, further
 * OP replies are no-ops because the state guard short-circuits.
 *
 * Human-mod removal respected: if `wasRemovedByHumanMod` returns true, we
 * still mark the sticky as `confirmed`/`flair-psa` but do NOT re-approve.
 */
export async function run(
  input: CommentSubmitInput,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  const sticky = await getStickyState(input.postId);
  if (!sticky) return { removed: false };
  if (sticky.state !== 'awaiting-ai') return { removed: false };
  if (input.parentId !== sticky.commentId) return { removed: false };

  // Fetch the post to confirm the commenter is OP.
  let postAuthorId: string | undefined;
  let postLike: PostLike;
  try {
    const post = await reddit.getPostById(input.postId);
    postAuthorId = post.authorId;
    postLike = {
      id: post.id,
      removed: post.removed,
      removedByCategory: post.removedByCategory,
    };
  } catch (err) {
    console.warn(`ai-gate: failed to fetch post ${input.postId}`, err);
    return { removed: false };
  }

  if (!postAuthorId || postAuthorId !== input.authorId) {
    return { removed: false };
  }

  // The PSA targets commenters, so the sticky's post-AI transition keys off
  // whether comments require flair.
  const flairOn = isLiveMode(settings.flairCommentMode);
  const nextState = nextStateAfterAiSatisfied({ flairOn });

  // If a human mod removed the post in the meantime, transition the sticky
  // (so it stops asking) but do NOT re-approve.
  if (await wasRemovedByHumanMod(postLike)) {
    await transitionSticky(input.postId as T3, nextState);
    logFeatureAction({
      feature: 'ai-gate',
      mode: settings.aiGateMode,
      action: 'transition-sticky',
      postId: input.postId,
      authorName: input.authorName,
      reason: `OP replied but post was manually removed; not re-approving`,
      extra: { newState: nextState },
    });
    return { removed: false };
  }

  await approvePostById(input.postId as T3);
  await transitionSticky(input.postId as T3, nextState);
  logFeatureAction({
    feature: 'ai-gate',
    mode: settings.aiGateMode,
    action: 'reapprove-post',
    postId: input.postId,
    authorName: input.authorName,
    reason: 'OP replied to awaiting-ai sticky',
    extra: { newState: nextState },
  });
  return { removed: false };
}
