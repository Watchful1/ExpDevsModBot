import { redis } from '@devvit/web/server';
import { REDIS_KEYS, TTL } from '../../config';

export type EngagementRecord = {
  jobId: string;
  authorId: string;
  authorName: string;
  scheduledAt: number;
};

export type EngagementStickyRecord = {
  commentId: string;
  createdAt: number;
};

export async function setEngagementJob(
  postId: string,
  record: EngagementRecord
): Promise<void> {
  await redis.set(REDIS_KEYS.engage(postId), JSON.stringify(record), {
    expiration: new Date(Date.now() + TTL.engage * 1000),
  });
}

export async function getEngagementJob(
  postId: string
): Promise<EngagementRecord | null> {
  const raw = await redis.get(REDIS_KEYS.engage(postId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EngagementRecord;
  } catch {
    return null;
  }
}

export async function clearEngagementJob(postId: string): Promise<void> {
  await redis.del(REDIS_KEYS.engage(postId));
}

export async function setEngagementSticky(
  postId: string,
  record: EngagementStickyRecord
): Promise<void> {
  await redis.set(
    REDIS_KEYS.engagementSticky(postId),
    JSON.stringify(record),
    {
      expiration: new Date(Date.now() + TTL.engagementSticky * 1000),
    }
  );
}

export async function getEngagementSticky(
  postId: string
): Promise<EngagementStickyRecord | null> {
  const raw = await redis.get(REDIS_KEYS.engagementSticky(postId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EngagementStickyRecord;
  } catch {
    return null;
  }
}

export async function clearEngagementSticky(postId: string): Promise<void> {
  await redis.del(REDIS_KEYS.engagementSticky(postId));
}
