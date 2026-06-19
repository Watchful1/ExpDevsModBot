import { reddit } from '@devvit/web/server';
import type { T3 } from '@devvit/shared-types/tid.js';
import { isLiveMode } from '../../config';
import { logFeatureAction } from '../../core/logging';
import { approvePostById } from '../../core/reddit-helpers';
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
 * Non-us removal respected: `approvePostById` declines to approve if the post
 * is currently removed by anyone other than the bot. The sticky still
 * transitions (OP did satisfy the gate) but the post stays removed.
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
  try {
    const post = await reddit.getPostById(input.postId);
    postAuthorId = post.authorId;
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

  const approved = await approvePostById(input.postId as T3);
  await transitionSticky(input.postId as T3, nextState);
  logFeatureAction({
    feature: 'ai-gate',
    mode: settings.aiGateMode,
    action: approved ? 'reapprove-post' : 'transition-sticky',
    postId: input.postId,
    authorName: input.authorName,
    reason: approved
      ? 'OP replied to awaiting-ai sticky'
      : 'OP replied but post is removed by not-us; not re-approving',
    extra: { newState: nextState },
  });
  return { removed: false };
}
