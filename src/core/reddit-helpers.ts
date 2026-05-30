import { reddit, redis } from '@devvit/web/server';
import type { T3 } from '@devvit/shared-types/tid.js';
import {
  HUMAN_MOD_REMOVAL_CATEGORIES,
  REDIS_KEYS,
  TTL,
} from '../config';

/**
 * Minimal post-shape this module needs. Real Devvit Post objects have many
 * more accessors; we list just what predicates touch so unit tests don't have
 * to fake the whole class.
 */
export type PostLike = {
  id?: string | undefined;
  removed?: boolean | undefined;
  removedByCategory?: string | undefined;
};

/**
 * True iff the post's `removedByCategory` indicates a human moderator or admin
 * removed it. This is the bright line for "do not re-approve."
 *
 * IMPORTANT: this returns true even when *we* called remove() and Reddit
 * happens to set removedByCategory to 'moderator' because we run as a mod.
 * Callers that need to disambiguate should check `wasRemovedByUs(postId)`
 * first; if true, the human-mod test does not apply.
 */
export function isRemovedByHumanModCategory(post: PostLike): boolean {
  return (
    !!post.removedByCategory &&
    HUMAN_MOD_REMOVAL_CATEGORIES.has(post.removedByCategory)
  );
}

/**
 * True if the modbot recently removed this post (Redis marker present).
 */
export async function wasRemovedByUs(postId: string): Promise<boolean> {
  const v = await redis.get(REDIS_KEYS.removedByUs(postId));
  return !!v;
}

/**
 * Composite: "should we leave this post alone because a human mod removed it
 * after us (or before us, e.g. AutoMod-filtered)?"
 *
 * Returns true when:
 *   - post is currently removed AND
 *   - removedByCategory is a human-mod category AND
 *   - we did NOT record a recent removal of our own
 */
export async function wasRemovedByHumanMod(post: PostLike): Promise<boolean> {
  if (!post.removed) return false;
  if (!isRemovedByHumanModCategory(post)) return false;
  if (!post.id) return true;
  const ours = await wasRemovedByUs(post.id);
  return !ours;
}

/**
 * Remove a post and record the action so wasRemovedByHumanMod() won't
 * mistakenly conclude a human did it. Idempotent — re-removing a post that we
 * already removed simply refreshes the marker.
 */
export async function removePostByUs(postId: T3): Promise<void> {
  const post = await reddit.getPostById(postId);
  await post.remove();
  await redis.set(REDIS_KEYS.removedByUs(postId), '1', {
    expiration: new Date(Date.now() + TTL.removedByUs * 1000),
  });
}

/**
 * Approve a post by id. No-op-safe if Reddit reports the post as not removed.
 * Caller is responsible for checking wasRemovedByHumanMod() first when needed.
 */
export async function approvePostById(postId: T3): Promise<void> {
  const post = await reddit.getPostById(postId);
  await post.approve();
  await redis.del(REDIS_KEYS.removedByUs(postId));
}

/**
 * Submit a distinguished + stickied comment on the post containing a removal
 * explanation. Returns the comment id. Used by min-karma, flair (post
 * removal), and engagement removal (Track B). When the post already has a
 * Track A sticky, calling distinguish(true) here replaces the sticky.
 */
export async function postRemovalSticky(
  postId: T3,
  body: string
): Promise<string | undefined> {
  try {
    const comment = await reddit.submitComment({
      id: postId,
      text: body,
      runAs: 'APP',
    });
    try {
      await comment.distinguish(true);
    } catch (err) {
      console.warn('postRemovalSticky distinguish failed', err);
    }
    return comment.id;
  } catch (err) {
    console.warn('postRemovalSticky submitComment failed', err);
    return undefined;
  }
}

/**
 * SETNX-style guard for at-least-once trigger deliveries. Returns true if this
 * was the first time we saw this key (caller should proceed); false if it was
 * already set (caller should skip).
 */
export async function claimOnce(
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  const result = await redis.set(key, '1', {
    nx: true,
    expiration: new Date(Date.now() + ttlSeconds * 1000),
  });
  // The Devvit redis.set returns the stored string when set, or empty when
  // skipped due to NX. Treat any truthy result as "we claimed it."
  return !!result;
}
