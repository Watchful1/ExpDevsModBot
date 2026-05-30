import { reddit } from '@devvit/web/server';
import { REMOVAL_REASONS, isShadowMode } from '../../config';
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
      karma: number;
      threshold: number;
      reason: string;
    };

export async function decide(
  input: PostSubmitInput,
  settings: ResolvedSettings,
  ctx: DispatchContext
): Promise<Decision> {
  if (settings.minKarmaMode === 'off') {
    return { kind: 'noop', reason: 'feature off' };
  }
  if (ctx.alreadyRemoved) {
    return { kind: 'noop', reason: 'post already removed by earlier feature' };
  }

  let total: number;
  try {
    const resp = await reddit.getUserKarmaFromCurrentSubreddit(
      input.authorName
    );
    total = (resp.fromPosts ?? 0) + (resp.fromComments ?? 0);
  } catch (err) {
    console.warn(
      `min-karma: getUserKarmaFromCurrentSubreddit failed for ${input.authorName}`,
      err
    );
    // Best to fail open — let the post through if we can't measure.
    return { kind: 'noop', reason: 'karma fetch failed; failing open' };
  }

  if (total >= settings.minKarmaThreshold) {
    return {
      kind: 'noop',
      reason: `karma ${total} >= threshold ${settings.minKarmaThreshold}`,
    };
  }
  return {
    kind: 'remove',
    karma: total,
    threshold: settings.minKarmaThreshold,
    reason: `karma ${total} < threshold ${settings.minKarmaThreshold}`,
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

  if (isShadowMode(settings.minKarmaMode)) {
    logFeatureAction({
      feature: 'min-karma',
      mode: settings.minKarmaMode,
      action: 'remove-post',
      postId: input.postId,
      authorName: input.authorName,
      reason: decision.reason,
      extra: { karma: decision.karma, threshold: decision.threshold },
    });
    return { removed: false };
  }

  // live: mode === 'on' or 'on+'
  await removePostByUs(input.postId);
  await postRemovalSticky(
    input.postId,
    REMOVAL_REASONS.minKarma(decision.threshold)
  );
  logFeatureAction({
    feature: 'min-karma',
    mode: settings.minKarmaMode,
    action: 'remove-post',
    postId: input.postId,
    authorName: input.authorName,
    reason: decision.reason,
    extra: { karma: decision.karma, threshold: decision.threshold },
  });
  return { removed: true };
}

export async function run(
  input: PostSubmitInput,
  settings: ResolvedSettings,
  ctx: DispatchContext
): Promise<FeatureResult> {
  const decision = await decide(input, settings, ctx);
  return apply(decision, input, settings);
}
