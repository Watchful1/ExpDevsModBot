import {
  AI_TOPIC_ALLOWED_DAYS_UTC,
  AI_TOPIC_FLAIR_NAMES,
  REMOVAL_REASONS,
  isShadowMode,
} from '../../config';
import { logFeatureAction } from '../../core/logging';
import { postRemovalSticky, removePostByUs } from '../../core/reddit-helpers';
import type { ResolvedSettings } from '../../core/settings';
import type {
  DispatchContext,
  FeatureResult,
  PostSubmitInput,
} from '../types';

export type Decision =
  | { kind: 'noop'; reason: string }
  | {
      kind: 'remove';
      flairText: string;
      dayOfWeekUtc: number;
      reason: string;
    };

/**
 * Pure decision: should this post be removed for posting on an AI-topic
 * flair outside the allowed UTC weekdays? `now` is injectable so tests can
 * exercise every weekday without mocking the clock.
 */
export function decide(
  input: PostSubmitInput,
  settings: ResolvedSettings,
  ctx: DispatchContext,
  now: Date = new Date()
): Decision {
  if (settings.aiTopicDayMode === 'off') {
    return { kind: 'noop', reason: 'feature off' };
  }
  if (ctx.alreadyRemoved) {
    return { kind: 'noop', reason: 'post already removed by earlier feature' };
  }
  const flair = input.postFlairText?.trim();
  if (!flair) {
    return { kind: 'noop', reason: 'post has no link flair' };
  }
  if (!AI_TOPIC_FLAIR_NAMES.has(flair.toLowerCase())) {
    return { kind: 'noop', reason: `link flair "${flair}" is not AI-topic` };
  }
  const day = now.getUTCDay();
  if (AI_TOPIC_ALLOWED_DAYS_UTC.has(day)) {
    return {
      kind: 'noop',
      reason: `AI-topic flair "${flair}" allowed on UTC day ${day}`,
    };
  }
  return {
    kind: 'remove',
    flairText: flair,
    dayOfWeekUtc: day,
    reason: `AI-topic flair "${flair}" not allowed on UTC day ${day}`,
  };
}

export async function apply(
  decision: Decision,
  input: PostSubmitInput,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  if (decision.kind === 'noop') {
    return { removed: false };
  }

  if (isShadowMode(settings.aiTopicDayMode)) {
    logFeatureAction({
      feature: 'ai-topic-days',
      mode: settings.aiTopicDayMode,
      action: 'remove-post',
      postId: input.postId,
      authorName: input.authorName,
      reason: decision.reason,
      extra: {
        flair: decision.flairText,
        dayOfWeekUtc: decision.dayOfWeekUtc,
      },
    });
    return { removed: false };
  }

  // live: mode === 'on' or 'on+'
  await removePostByUs(input.postId);
  await postRemovalSticky(input.postId, REMOVAL_REASONS.aiTopicDay);
  logFeatureAction({
    feature: 'ai-topic-days',
    mode: settings.aiTopicDayMode,
    action: 'remove-post',
    postId: input.postId,
    authorName: input.authorName,
    reason: decision.reason,
    extra: {
      flair: decision.flairText,
      dayOfWeekUtc: decision.dayOfWeekUtc,
    },
  });
  return { removed: true };
}

export async function run(
  input: PostSubmitInput,
  settings: ResolvedSettings,
  ctx: DispatchContext
): Promise<FeatureResult> {
  const decision = decide(input, settings, ctx);
  return apply(decision, input, settings);
}
