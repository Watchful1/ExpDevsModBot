import { reddit } from '@devvit/web/server';
import type { T3 } from '@devvit/shared-types/tid.js';
import { logFeatureAction } from '../../core/logging';
import { approvePostById } from '../../core/reddit-helpers';
import type { ResolvedSettings } from '../../core/settings';
import { getStickyState, restickyTrackA } from '../../core/sticky';
import type { CommentSubmitInput, FeatureResult } from '../types';
import {
  clearEngagementSticky,
  getEngagementSticky,
} from './state';

/**
 * If OP comments on their post AFTER an engagement removal, re-approve the
 * post and delete the Track B sticky.
 *
 * Preconditions:
 *   - feature is on (shadow mode never removed, so nothing to re-approve)
 *   - we have an engagement-sticky record for this post (means we removed it)
 *   - the commenter is OP
 *   - the comment's parent is NOT the Track A sticky (AI reply doesn't count)
 */
export async function run(
  input: CommentSubmitInput,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  if (settings.engagementMode !== 'on') return { removed: false };

  const engagementSticky = await getEngagementSticky(input.postId);
  if (!engagementSticky) return { removed: false };

  // Check the Track A sticky — OP replies to it don't count.
  const trackA = await getStickyState(input.postId);
  if (trackA && input.parentId === trackA.commentId) {
    return { removed: false };
  }

  // Confirm OP authorship by fetching the post.
  let opAuthorId: string | undefined;
  try {
    const post = await reddit.getPostById(input.postId);
    opAuthorId = post.authorId;
  } catch (err) {
    console.warn(
      `op-engagement: failed to fetch post ${input.postId}`,
      err
    );
    return { removed: false };
  }

  if (!opAuthorId || opAuthorId !== input.authorId) {
    return { removed: false };
  }

  // Re-approve the post.
  await approvePostById(input.postId as T3);

  // Delete the Track B sticky.
  try {
    const trackB = await reddit.getCommentById(
      engagementSticky.commentId as `t1_${string}`
    );
    await trackB.delete();
  } catch (err) {
    console.warn(
      `op-engagement: failed to delete Track B sticky for ${input.postId}`,
      err
    );
  }
  await clearEngagementSticky(input.postId);

  // Re-sticky Track A if it still exists.
  await restickyTrackA(input.postId);

  logFeatureAction({
    feature: 'op-engagement',
    mode: 'on',
    action: 'reapprove-post',
    postId: input.postId,
    authorName: input.authorName,
    reason: 'OP commented after engagement removal',
  });

  return { removed: false };
}
