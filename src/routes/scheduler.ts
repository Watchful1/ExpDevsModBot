import { Hono } from 'hono';
import type {
  ScheduledJobEvent,
  TaskResponse,
} from '@devvit/web/server';
import { runScheduledCheck } from '../features/op-engagement/on-scheduled-check';

export const scheduler = new Hono();

type EngagementJobData = {
  postId: string;
  authorId: string;
  authorName: string;
};

scheduler.post('/op-engagement-check', async (c) => {
  let body: ScheduledJobEvent<EngagementJobData>;
  try {
    body = await c.req.json<ScheduledJobEvent<EngagementJobData>>();
  } catch (err) {
    console.warn('op-engagement-check: invalid body', err);
    return c.json<TaskResponse>({}, 200);
  }
  try {
    await runScheduledCheck(body.data);
  } catch (err) {
    console.error('op-engagement-check failed', err);
  }
  return c.json<TaskResponse>({}, 200);
});
