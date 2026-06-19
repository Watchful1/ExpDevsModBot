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
 * gRPC code 2 (UNKNOWN) and 14 (UNAVAILABLE) typically mean a transient
 * connection issue — most commonly an HTTP/2 GOAWAY from Reddit's backend
 * gracefully closing a connection. Retrying once almost always succeeds.
 */
function isTransientGrpcError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 2 || code === 14;
}

/**
 * Run an async Reddit-API call; on a transient gRPC error, retry once.
 * Non-transient errors propagate unchanged so callers can decide what to do.
 */
export async function withGrpcRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientGrpcError(err)) throw err;
    console.warn(`[modbot] ${label}: transient gRPC error, retrying once`, err);
    return await fn();
  }
}

/**
 * Remove a post and record the action so wasRemovedByHumanMod() won't
 * mistakenly conclude a human did it. Idempotent — re-removing a post that we
 * already removed simply refreshes the marker.
 */
export async function removePostByUs(postId: T3): Promise<void> {
  const post = await withGrpcRetry(
    () => reddit.getPostById(postId),
    'removePostByUs:getPostById'
  );
  await withGrpcRetry(() => post.remove(), 'removePostByUs:remove');
  await redis.set(REDIS_KEYS.removedByUs(postId), '1', {
    expiration: new Date(Date.now() + TTL.removedByUs * 1000),
  });
}

/**
 * Approve a post by id, but only if the bot is the one that removed it.
 *
 * Returns true when we actually called approve(); false when we skipped
 * because the post is currently removed and we have no `removed-by-us`
 * marker (meaning someone else — human mod, AutoMod, Reddit anti-spam, or
 * us before the 24h marker TTL expired — owns the current removal).
 *
 * This is the single chokepoint for "don't undo someone else's removal"; all
 * re-approval paths go through here so no caller has to remember the check.
 */
export async function approvePostById(postId: T3): Promise<boolean> {
  const post = await withGrpcRetry(
    () => reddit.getPostById(postId),
    'approvePostById:getPostById'
  );
  if (post.removed) {
    const ours = await wasRemovedByUs(postId);
    if (!ours) {
      console.log(
        `[modbot] approvePostById skip postId=${postId} reason="removed by not-us; no removed-by-us marker"`
      );
      return false;
    }
  }
  await withGrpcRetry(() => post.approve(), 'approvePostById:approve');
  await redis.del(REDIS_KEYS.removedByUs(postId));
  return true;
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
