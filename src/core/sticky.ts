import { reddit, redis } from '@devvit/web/server';
import type { T3 } from '@devvit/shared-types/tid.js';
import {
  REDIS_KEYS,
  STICKY_BODIES,
  TTL,
  type StickyState,
} from '../config';
import { withGrpcRetry } from './reddit-helpers';

export type StickyRecord = {
  commentId: string;
  state: StickyState;
  createdAt: number;
};

// ────────────────────────────────────────────────────────────────────────────
// Pure logic (unit-tested in sticky.test.ts)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Initial Track A state when a new post is processed (after karma + flair
 * checks have decided not to remove it).
 *
 *   AI gate on  → awaiting-ai (regardless of flair mode)
 *   AI gate off, flair on → flair-psa
 *   AI gate off, flair off/shadow → null (no sticky)
 */
export function initialStickyStateForPost(args: {
  aiGateOn: boolean;
  flairOn: boolean;
}): StickyState | null {
  if (args.aiGateOn) return 'awaiting-ai';
  if (args.flairOn) return 'flair-psa';
  return null;
}

/**
 * Track A's next state when the AI gate is satisfied (OP replied to the
 * awaiting-ai sticky). Only meaningful when current state is 'awaiting-ai'.
 *
 *   flair on  → flair-psa  (post-approval PSA reminding commenters)
 *   flair off → confirmed  (acknowledgement)
 */
export function nextStateAfterAiSatisfied(args: {
  flairOn: boolean;
}): StickyState {
  return args.flairOn ? 'flair-psa' : 'confirmed';
}

// ────────────────────────────────────────────────────────────────────────────
// I/O — Redis + Reddit API
// ────────────────────────────────────────────────────────────────────────────

export async function getStickyState(
  postId: string
): Promise<StickyRecord | null> {
  const raw = await redis.get(REDIS_KEYS.botSticky(postId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StickyRecord;
  } catch {
    return null;
  }
}

async function writeStickyRecord(
  postId: string,
  record: StickyRecord
): Promise<void> {
  await redis.set(REDIS_KEYS.botSticky(postId), JSON.stringify(record), {
    expiration: new Date(Date.now() + TTL.botSticky * 1000),
  });
}

/**
 * Ensures a Track A sticky exists on the post in the given state. If we have
 * no record, submit a fresh comment, distinguish-sticky it, and store the
 * record. If we already have a sticky and the state matches, no-op.
 * If the state differs, edit the existing comment to the new state's body.
 */
export async function ensureSticky(
  postId: T3,
  desiredState: StickyState
): Promise<StickyRecord> {
  const existing = await getStickyState(postId);
  if (existing) {
    if (existing.state === desiredState) return existing;
    return transitionSticky(postId, desiredState);
  }

  const comment = await withGrpcRetry(
    () =>
      reddit.submitComment({
        id: postId,
        text: STICKY_BODIES[desiredState],
        runAs: 'APP',
      }),
    'ensureSticky:submitComment'
  );
  try {
    await comment.distinguish(true);
  } catch (err) {
    console.warn('sticky.distinguish failed', err);
  }
  const record: StickyRecord = {
    commentId: comment.id,
    state: desiredState,
    createdAt: Date.now(),
  };
  await writeStickyRecord(postId, record);
  return record;
}

/**
 * Edit an existing Track A sticky to the body for newState, preserving the
 * comment id. If no record exists, creates a new sticky via ensureSticky().
 */
export async function transitionSticky(
  postId: T3,
  newState: StickyState
): Promise<StickyRecord> {
  const existing = await getStickyState(postId);
  if (!existing) {
    return ensureSticky(postId, newState);
  }
  if (existing.state === newState) {
    return existing;
  }
  try {
    const comment = await reddit.getCommentById(existing.commentId as `t1_${string}`);
    await comment.edit({ text: STICKY_BODIES[newState] });
  } catch (err) {
    console.warn('sticky.edit failed', err);
  }
  const updated: StickyRecord = { ...existing, state: newState };
  await writeStickyRecord(postId, updated);
  return updated;
}

/**
 * Re-sticky the Track A comment. Used after Track B is removed and we need to
 * bring the multipurpose sticky back to the top.
 */
export async function restickyTrackA(postId: string): Promise<void> {
  const existing = await getStickyState(postId);
  if (!existing) return;
  try {
    const comment = await reddit.getCommentById(existing.commentId as `t1_${string}`);
    await comment.distinguish(true);
  } catch (err) {
    console.warn('sticky.restickyTrackA failed', err);
  }
}

/**
 * Delete the Track A bot comment and clear its Redis record. Rarely used —
 * the sticky normally just transitions states. Provided for completeness.
 */
export async function removeStickyComment(postId: string): Promise<void> {
  const existing = await getStickyState(postId);
  if (!existing) return;
  try {
    const comment = await reddit.getCommentById(existing.commentId as `t1_${string}`);
    await comment.delete();
  } catch (err) {
    console.warn('sticky.removeStickyComment failed', err);
  }
  await redis.del(REDIS_KEYS.botSticky(postId));
}
