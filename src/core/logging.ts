import type { FeatureName, Mode, BinaryMode } from '../config';

/**
 * Structured log helper. Every line follows the pattern
 *
 *   [modbot] [<mode>] feature=<name> action=<verb> postId=<id> author=<u> reason="<why>"
 *
 * so it's easy to grep through `devvit logs <subreddit>` output. The
 * `shadow`-mode lines exist specifically so we can validate behavior before
 * flipping a feature live.
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
  const tag = args.mode === 'shadow' ? '[shadow]' : '[live]';
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
  console.log(parts.join(' '));
}
