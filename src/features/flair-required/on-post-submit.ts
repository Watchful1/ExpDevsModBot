import type { T3 } from '@devvit/shared-types/tid.js';
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
  | { kind: 'remove'; reason: string };

export function decide(
  input: PostSubmitInput,
  settings: ResolvedSettings,
  ctx: DispatchContext
): Decision {
  if (settings.flairPostMode === 'off') {
    return { kind: 'noop', reason: 'feature off' };
  }
  if (ctx.alreadyRemoved) {
    return { kind: 'noop', reason: 'post already removed by earlier feature' };
  }
  if (input.authorHasFlair) {
    return { kind: 'noop', reason: 'author has user flair' };
  }
  return { kind: 'remove', reason: 'author has no user flair' };
}

export async function apply(
  decision: Decision,
  input: PostSubmitInput,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  if (decision.kind === 'noop') {
    return { removed: false };
  }

  if (isShadowMode(settings.flairPostMode)) {
    logFeatureAction({
      feature: 'flair-required',
      mode: settings.flairPostMode,
      action: 'remove-post',
      postId: input.postId,
      authorName: input.authorName,
      reason: decision.reason,
    });
    return { removed: false };
  }

  await removePostByUs(input.postId as T3);
  await postRemovalSticky(input.postId as T3, REMOVAL_REASONS.flairMissing);
  logFeatureAction({
    feature: 'flair-required',
    mode: settings.flairPostMode,
    action: 'remove-post',
    postId: input.postId,
    authorName: input.authorName,
    reason: decision.reason,
  });
  return { removed: true };
}

export async function run(
  input: PostSubmitInput,
  settings: ResolvedSettings,
  ctx: DispatchContext
): Promise<FeatureResult> {
  return apply(decide(input, settings, ctx), input, settings);
}
