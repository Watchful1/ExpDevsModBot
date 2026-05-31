import {
  isShadowMode,
  shouldMirrorToDiscord,
  type BinaryMode,
  type FeatureName,
  type Mode,
} from '../config';
import { formatDiscordSentence, notifyDiscord } from './discord';

/**
 * Structured log helper. Every line follows the pattern
 *
 *   [modbot] [<mode>] feature=<name> action=<verb> postId=<id> author=<u> reason="<why>"
 *
 * so it's easy to grep through `devvit logs <subreddit>` output. The
 * `shadow` / `shadow+` mode lines exist specifically so we can validate
 * behavior before flipping a feature live. When the feature's mode is
 * `shadow+`, the same line is also fired to the configured Discord webhook.
 */
export function logFeatureAction(args: {
  feature: FeatureName;
  mode: Mode | BinaryMode;
  action:
    | 'remove-post'
    | 'remove-comment'
    | 'sticky'
    | 'transition-sticky'
    | 'reapprove-post'
    | 'schedule-check'
    | 'skip'
    | 'engagement-remove';
  postId?: string;
  commentId?: string;
  authorId?: string;
  authorName?: string;
  reason: string;
  extra?: Record<string, unknown>;
}): void {
  const tag = isShadowMode(args.mode) ? '[shadow]' : '[live]';
  const parts = [
    '[modbot]',
    tag,
    `feature=${args.feature}`,
    `action=${args.action}`,
  ];
  if (args.postId) parts.push(`postId=${args.postId}`);
  if (args.commentId) parts.push(`commentId=${args.commentId}`);
  if (args.authorName) parts.push(`author=${args.authorName}`);
  else if (args.authorId) parts.push(`authorId=${args.authorId}`);
  parts.push(`reason="${args.reason}"`);
  if (args.extra) {
    for (const [k, v] of Object.entries(args.extra)) {
      parts.push(`${k}=${JSON.stringify(v)}`);
    }
  }
  const line = parts.join(' ');
  console.log(line);
  if (shouldMirrorToDiscord(args.mode)) {
    const sentence = formatDiscordSentence({
      feature: args.feature,
      action: args.action,
      mode: args.mode,
      ...(args.postId !== undefined && { postId: args.postId }),
      ...(args.commentId !== undefined && { commentId: args.commentId }),
      ...(args.authorName !== undefined && { authorName: args.authorName }),
      reason: args.reason,
    });
    if (sentence) notifyDiscord(sentence);
  }
}
