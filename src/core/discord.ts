import { isShadowMode, type BinaryMode, type Mode } from '../config';
import { getSettings } from './settings';

// ─────────────────────────────────────────────────────────────────────────────
// Reddit URL helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a reddit.com URL for a thing id. Posts (t3_) get a comments link;
 * comments (t1_) get a comments link with the comment id pinned via the
 * standard `/comments/<post>/_/<comment>/` form if we know the post,
 * otherwise just `/comments/<comment>` (Reddit redirects this).
 */
function postUrl(postId: string): string {
  const shortId = postId.replace(/^t3_/, '');
  return `https://reddit.com/comments/${shortId}`;
}
function commentUrl(postId: string, commentId: string): string {
  const postShort = postId.replace(/^t3_/, '');
  const commentShort = commentId.replace(/^t1_/, '');
  return `https://reddit.com/comments/${postShort}/_/${commentShort}`;
}

/**
 * Wrap a URL in Discord's link syntax with `<>` around the URL to suppress
 * preview embeds — otherwise every notification blows up into a huge
 * post-preview card in the channel.
 */
function mdLink(label: string, url: string): string {
  return `[${label}](<${url}>)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discord sentence formatter
// ─────────────────────────────────────────────────────────────────────────────

export type DiscordArgs = {
  feature: string;
  action:
    | 'remove-post'
    | 'remove-comment'
    | 'sticky'
    | 'transition-sticky'
    | 'reapprove-post'
    | 'schedule-check'
    | 'skip'
    | 'engagement-remove';
  mode: Mode | BinaryMode;
  postId?: string;
  commentId?: string;
  authorName?: string;
  reason: string;
};

/**
 * Render a one-sentence Discord notification, returns null for action types
 * that aren't worth notifying about (e.g. skips, scheduling).
 *
 * Examples:
 *   Would remove [post](<…>) by u/Alice — karma 3 < threshold 10
 *   Removed [post](<…>) by u/Bob — awaiting AI disclosure
 *   Re-approved [post](<…>) by u/Carol — OP replied to AI sticky
 *   Engagement-removed [post](<…>) by u/Dave — OP silent at window expiry
 */
export function formatDiscordSentence(args: DiscordArgs): string | null {
  if (args.action === 'skip' || args.action === 'schedule-check') return null;

  const shadow = isShadowMode(args.mode);
  const post = args.postId ? mdLink('post', postUrl(args.postId)) : 'post';
  const comment =
    args.commentId && args.postId
      ? mdLink('comment', commentUrl(args.postId, args.commentId))
      : 'comment';
  const user = args.authorName ? ` by u/${args.authorName}` : '';
  const tail = args.reason ? ` — ${args.reason}` : '';

  switch (args.action) {
    case 'remove-post':
      return `${shadow ? 'Would remove' : 'Removed'} ${post}${user}${tail}`;
    case 'remove-comment':
      return `${shadow ? 'Would remove' : 'Removed'} ${comment} on ${post}${user}${tail}`;
    case 'sticky':
      return `Stickied ${post}${user}${tail}`;
    case 'transition-sticky':
      return `Updated sticky on ${post}${tail}`;
    case 'reapprove-post':
      return `Re-approved ${post}${user}${tail}`;
    case 'engagement-remove':
      return `${shadow ? 'Would engagement-remove' : 'Engagement-removed'} ${post}${user}${tail}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget Discord webhook notifier. Reads the webhook URL from
 * subreddit settings; if blank or the post fails for any reason, swallows the
 * error so production behavior is never blocked by a Discord outage.
 */
export function notifyDiscord(content: string): void {
  void (async () => {
    try {
      const settings = await getSettings();
      const url = settings.discordWebhookUrl.trim();
      if (!url) return;
      const trimmed =
        content.length > 1900 ? content.slice(0, 1900) + '…' : content;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) {
        console.warn(
          `notifyDiscord: webhook returned ${res.status} ${res.statusText}`
        );
      }
    } catch (err) {
      console.warn('notifyDiscord: post failed', err);
    }
  })();
}
