import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import type { T3 } from '@devvit/shared-types/tid.js';
import { REDIS_KEYS, TTL } from '../config';
import { getAppAccountUsername, isModerator, refreshModeratorCache } from '../core/exemptions';
import { logFeatureAction } from '../core/logging';
import { claimOnce } from '../core/reddit-helpers';
import { getSettings } from '../core/settings';
import { getStickyState } from '../core/sticky';

import { run as aiGatePostSubmit } from '../features/ai-gate/on-post-submit';
import { run as aiGateCommentSubmit } from '../features/ai-gate/on-comment-submit';
import { run as flairPostSubmit } from '../features/flair-required/on-post-submit';
import { run as flairCommentSubmit } from '../features/flair-required/on-comment-submit';
import { run as minKarmaPostSubmit } from '../features/min-karma/on-post-submit';
import { run as opEngagementPostSubmit } from '../features/op-engagement/on-post-submit';
import { run as opEngagementCommentSubmit } from '../features/op-engagement/on-comment-submit';

import type {
  CommentSubmitInput,
  DispatchContext,
  PostSubmitInput,
} from '../features/types';

export const triggers = new Hono();

// Devvit hasn't published an exhaustive TS shape for the inbound trigger
// bodies — they mirror the public-api EventTypes (PostSubmit, CommentSubmit)
// with `post`, `comment`, `author`, `subreddit` as optional fields. We define
// just what we read.
type UserV2Like = { id?: string; name?: string; flair?: { text?: string } };
type PostV2Like = { id?: string; authorId?: string; authorFlair?: { text?: string } };
type CommentV2Like = {
  id?: string;
  parentId?: string;
  postId?: string;
  body?: string;
  author?: string;
};

type PostSubmitBody = {
  post?: PostV2Like;
  author?: UserV2Like;
};

type CommentSubmitBody = {
  post?: PostV2Like;
  comment?: CommentV2Like;
  author?: UserV2Like;
};

function hasNonEmpty(text: string | undefined): boolean {
  return typeof text === 'string' && text.trim().length > 0;
}

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  console.log('App installed to subreddit: r/' + input.subreddit?.name);
  // Warm the moderator cache so the first PostSubmit doesn't pay the API call.
  try {
    await refreshModeratorCache();
  } catch (err) {
    console.warn('onAppInstall: refreshModeratorCache failed', err);
  }
  return c.json<TriggerResponse>({ status: 'success' }, 200);
});

triggers.post('/on-post-submit', async (c) => {
  let body: PostSubmitBody;
  try {
    body = await c.req.json<PostSubmitBody>();
  } catch {
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  }
  const post = body.post;
  const author = body.author;
  if (!post?.id || !author?.id || !author?.name) {
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  }
  const postId = post.id as T3;

  console.log(
    `[modbot] on-post-submit received postId=${postId} author=${author.name}`
  );

  // Idempotency: PostSubmit may be delivered more than once.
  const firstSeen = await claimOnce(
    REDIS_KEYS.processedPostSubmit(postId),
    TTL.processedPostSubmit
  );
  if (!firstSeen) {
    console.log(
      `[modbot] on-post-submit skip postId=${postId} reason="duplicate delivery"`
    );
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  }

  // Mod exemption (covers app account too).
  if (await isModerator(author.name)) {
    console.log(
      `[modbot] on-post-submit skip postId=${postId} author=${author.name} reason="author is moderator"`
    );
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  }

  const settings = await getSettings();
  console.log(
    `[modbot] on-post-submit settings postId=${postId} ` +
      `aiGate=${settings.aiGateMode} flairPost=${settings.flairPostMode} flairComment=${settings.flairCommentMode} ` +
      `engagement=${settings.engagementMode} minKarma=${settings.minKarmaMode} ` +
      `karmaThreshold=${settings.minKarmaThreshold} ` +
      `engagementWindow=${settings.engagementWindowMinutes}m ` +
      `engagementMinComments=${settings.engagementMinComments} ` +
      `authorHasFlair=${hasNonEmpty(author.flair?.text) || hasNonEmpty(post.authorFlair?.text)}`
  );
  const input: PostSubmitInput = {
    postId,
    authorId: author.id,
    authorName: author.name,
    authorHasFlair: hasNonEmpty(author.flair?.text) || hasNonEmpty(post.authorFlair?.text),
  };
  const ctx: DispatchContext = { alreadyRemoved: false };

  try {
    const r1 = await minKarmaPostSubmit(input, settings, ctx);
    if (r1.removed) ctx.alreadyRemoved = true;

    const r2 = await flairPostSubmit(input, settings, ctx);
    if (r2.removed) ctx.alreadyRemoved = true;

    const r3 = await aiGatePostSubmit(input, settings, ctx);
    if (r3.removed) ctx.alreadyRemoved = true;

    // op-engagement always schedules; idempotent self-check at fire time.
    await opEngagementPostSubmit(input, settings);
  } catch (err) {
    console.error('on-post-submit dispatcher error', err);
  }

  return c.json<TriggerResponse>({ status: 'success' }, 200);
});

triggers.post('/on-comment-submit', async (c) => {
  let body: CommentSubmitBody;
  try {
    body = await c.req.json<CommentSubmitBody>();
  } catch {
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  }

  const comment = body.comment;
  const author = body.author;
  if (
    !comment?.id ||
    !comment?.postId ||
    !comment?.parentId ||
    !author?.id ||
    !author?.name
  ) {
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  }

  console.log(
    `[modbot] on-comment-submit received commentId=${comment.id} postId=${comment.postId} author=${author.name}`
  );

  // Filter out the bot's own comments.
  const appSlug = getAppAccountUsername();
  if (appSlug && author.name.toLowerCase() === appSlug.toLowerCase()) {
    console.log(
      `[modbot] on-comment-submit skip commentId=${comment.id} reason="bot's own comment"`
    );
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  }

  // Mod exemption.
  if (await isModerator(author.name)) {
    console.log(
      `[modbot] on-comment-submit skip commentId=${comment.id} author=${author.name} reason="author is moderator"`
    );
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  }

  const settings = await getSettings();
  const postId = comment.postId as T3;
  const input: CommentSubmitInput = {
    commentId: comment.id,
    postId,
    parentId: comment.parentId,
    authorId: author.id,
    authorName: author.name,
    authorHasFlair: hasNonEmpty(author.flair?.text),
    body: comment.body ?? '',
  };

  try {
    // 1. ai-gate: re-approve if OP replied to awaiting-ai sticky.
    await aiGateCommentSubmit(input, settings);

    // 2. op-engagement: re-approve if OP commented after engagement removal.
    await opEngagementCommentSubmit(input, settings);

    // 3. flair-required for comments — but exempt OP's reply to the Track A
    //    sticky (otherwise we'd silently remove the AI-unlock comment).
    const trackA = await getStickyState(postId);
    const isOpReplyToTrackA =
      !!trackA &&
      trackA.commentId === input.parentId &&
      author.id !== undefined;
    if (isOpReplyToTrackA) {
      logFeatureAction({
        feature: 'flair-required',
        mode: settings.flairCommentMode,
        action: 'skip',
        postId,
        commentId: input.commentId,
        authorName: input.authorName,
        reason: 'OP reply to Track A sticky is exempt',
      });
    } else {
      await flairCommentSubmit(input, settings);
    }
  } catch (err) {
    console.error('on-comment-submit dispatcher error', err);
  }

  return c.json<TriggerResponse>({ status: 'success' }, 200);
});
