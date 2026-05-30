import { reddit } from '@devvit/web/server';
import type { T3 } from '@devvit/shared-types/tid.js';
import { ENGAGEMENT_REMOVAL_BODY, isShadowMode } from '../../config';
import { logFeatureAction } from '../../core/logging';
import {
  postRemovalSticky,
  removePostByUs,
  wasRemovedByHumanMod,
  wasRemovedByUs,
  type PostLike,
} from '../../core/reddit-helpers';
import { getSettings } from '../../core/settings';
import { getStickyState } from '../../core/sticky';
import { clearEngagementJob, setEngagementSticky } from './state';

export type ScheduledData = {
  postId: string;
  authorId: string;
  authorName: string;
};

/**
 * The 2h engagement check. Runs from the scheduler callback. Re-evaluates
 * state fresh — never trusts what was true at schedule time.
 *
 * Skips:
 *   - feature toggled off since scheduling
 *   - post already removed by anyone other than this bot
 *   - post has fewer than `engagementMinComments` total comments
 *   - OP has commented on their post in any non-Track-A position
 */
export async function runScheduledCheck(data: ScheduledData): Promise<void> {
  const settings = await getSettings();
  const postId = data.postId as T3;

  if (settings.engagementMode === 'off') {
    logFeatureAction({
      feature: 'op-engagement',
      mode: 'off',
      action: 'skip',
      postId,
      reason: 'feature disabled by the time job fired',
    });
    await clearEngagementJob(postId);
    return;
  }

  // Resolve the post state.
  let post: PostLike & {
    numComments?: number | undefined;
    authorId?: string | undefined;
  };
  try {
    const fetched = await reddit.getPostById(postId);
    post = {
      id: fetched.id,
      removed: fetched.removed,
      removedByCategory: fetched.removedByCategory,
      numComments: fetched.numberOfComments,
      authorId: fetched.authorId,
    };
  } catch (err) {
    logFeatureAction({
      feature: 'op-engagement',
      mode: settings.engagementMode,
      action: 'skip',
      postId,
      reason: 'failed to fetch post; assuming deleted',
    });
    console.warn('op-engagement getPostById failed', err);
    await clearEngagementJob(postId);
    return;
  }

  // Already removed by someone else (mod, AutoMod, or OP self-delete)?
  if (post.removed) {
    const ours = await wasRemovedByUs(postId);
    if (!ours) {
      logFeatureAction({
        feature: 'op-engagement',
        mode: settings.engagementMode,
        action: 'skip',
        postId,
        reason: `post already removed (removedByCategory=${post.removedByCategory ?? 'n/a'})`,
      });
      await clearEngagementJob(postId);
      return;
    }
    // We removed it — e.g. via AI gate. Re-running our removal is pointless.
    // The OP-comments re-approval path will handle restoration if OP later
    // engages. Skip this feature's own removal.
    logFeatureAction({
      feature: 'op-engagement',
      mode: settings.engagementMode,
      action: 'skip',
      postId,
      reason: 'post already removed by this bot via another feature',
    });
    await clearEngagementJob(postId);
    return;
  }

  // Human mod removal that didn't set `removed` to true is rare; check anyway.
  if (await wasRemovedByHumanMod(post)) {
    logFeatureAction({
      feature: 'op-engagement',
      mode: settings.engagementMode,
      action: 'skip',
      postId,
      reason: 'post manually removed by a mod',
    });
    await clearEngagementJob(postId);
    return;
  }

  const numComments = post.numComments ?? 0;
  if (numComments < settings.engagementMinComments) {
    logFeatureAction({
      feature: 'op-engagement',
      mode: settings.engagementMode,
      action: 'skip',
      postId,
      reason: `comment count ${numComments} < threshold ${settings.engagementMinComments}`,
    });
    await clearEngagementJob(postId);
    return;
  }

  // Has OP commented? Exclude any reply to the Track A sticky.
  const sticky = await getStickyState(postId);
  const opHasEngaged = await checkOpEngaged({
    postId,
    opAuthorId: post.authorId ?? data.authorId,
    stickyCommentId: sticky?.commentId,
  });

  if (opHasEngaged) {
    logFeatureAction({
      feature: 'op-engagement',
      mode: settings.engagementMode,
      action: 'skip',
      postId,
      reason: 'OP has commented (excluding any reply to AI sticky)',
    });
    await clearEngagementJob(postId);
    return;
  }

  // All checks failed — OP is silent. Act.
  if (isShadowMode(settings.engagementMode)) {
    logFeatureAction({
      feature: 'op-engagement',
      mode: settings.engagementMode,
      action: 'engagement-remove',
      postId,
      authorName: data.authorName,
      reason: 'would remove (shadow)',
      extra: { numComments, threshold: settings.engagementMinComments },
    });
    await clearEngagementJob(postId);
    return;
  }

  // live: engagementMode === 'on' or 'on+' — remove + Track B sticky
  await removePostByUs(postId);
  const commentId = await postRemovalSticky(
    postId,
    ENGAGEMENT_REMOVAL_BODY(settings.engagementWindowMinutes)
  );
  if (commentId) {
    await setEngagementSticky(postId, { commentId, createdAt: Date.now() });
  }
  logFeatureAction({
    feature: 'op-engagement',
    mode: settings.engagementMode,
    action: 'engagement-remove',
    postId,
    authorName: data.authorName,
    reason: 'OP silent at window expiry',
    extra: { numComments, threshold: settings.engagementMinComments },
  });
  await clearEngagementJob(postId);
}

/**
 * Walks the post's top-level comments looking for one authored by OP whose
 * parent is NOT the Track A sticky. We deliberately don't recurse — replies
 * by OP to other commenters count, but the cost is a single page fetch.
 */
async function checkOpEngaged(args: {
  postId: T3;
  opAuthorId: string;
  stickyCommentId: string | undefined;
}): Promise<boolean> {
  try {
    const comments = reddit.getComments({
      postId: args.postId,
      limit: 200,
      sort: 'new',
    });
    const all = await comments.all();
    for (const c of all) {
      if (c.authorId !== args.opAuthorId) continue;
      if (args.stickyCommentId && c.parentId === args.stickyCommentId) continue;
      return true;
    }
    return false;
  } catch (err) {
    console.warn('op-engagement: getComments failed', err);
    // Fail closed: don't remove if we can't tell.
    return true;
  }
}
