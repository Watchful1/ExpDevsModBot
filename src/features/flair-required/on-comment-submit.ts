import { reddit } from '@devvit/web/server';
import { isShadowMode } from '../../config';
import { logFeatureAction } from '../../core/logging';
import type { ResolvedSettings } from '../../core/settings';
import type { CommentSubmitInput, FeatureResult } from '../types';

export type Decision =
  | { kind: 'noop'; reason: string }
  | { kind: 'remove'; reason: string };

/**
 * Flair check for comments. Note: mod / app-account / OP-replying-to-Track-A
 * exemptions are handled by the dispatcher before this runs, so we only need
 * to look at the author's flair.
 */
export function decide(
  input: CommentSubmitInput,
  settings: ResolvedSettings
): Decision {
  if (settings.flairCommentMode === 'off') {
    return { kind: 'noop', reason: 'feature off' };
  }
  if (input.authorHasFlair) {
    return { kind: 'noop', reason: 'author has user flair' };
  }
  return { kind: 'remove', reason: 'author has no user flair' };
}

export async function apply(
  decision: Decision,
  input: CommentSubmitInput,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  if (decision.kind === 'noop') {
    return { removed: false };
  }

  if (isShadowMode(settings.flairCommentMode)) {
    logFeatureAction({
      feature: 'flair-required',
      mode: settings.flairCommentMode,
      action: 'remove-comment',
      postId: input.postId,
      commentId: input.commentId,
      authorName: input.authorName,
      reason: decision.reason,
    });
    return { removed: false };
  }

  try {
    const comment = await reddit.getCommentById(
      input.commentId as `t1_${string}`
    );
    await comment.remove();
  } catch (err) {
    console.warn(
      `flair-required: failed to remove comment ${input.commentId}`,
      err
    );
  }
  logFeatureAction({
    feature: 'flair-required',
    mode: settings.flairCommentMode,
    action: 'remove-comment',
    postId: input.postId,
    commentId: input.commentId,
    authorName: input.authorName,
    reason: decision.reason,
  });
  return { removed: true };
}

export async function run(
  input: CommentSubmitInput,
  settings: ResolvedSettings
): Promise<FeatureResult> {
  return apply(decide(input, settings), input, settings);
}
