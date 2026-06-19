/**
 * Shared constants for the modbot. Setting keys, Redis key builders, sticky
 * body templates, and TTLs all live here so individual feature modules don't
 * carry magic strings.
 */

/**
 * Mode for the shadow-capable features. The `+` suffix is an orthogonal flag
 * that means "also mirror the log line to the configured Discord webhook" —
 * useful for richer visibility during validation or ongoing operation than
 * scraping `devvit logs`.
 *
 *   off     — feature does nothing
 *   shadow  — log only (no Reddit-visible action)
 *   shadow+ — log + Discord (no Reddit-visible action)
 *   on      — live action
 *   on+     — live action + Discord
 */
export type Mode = 'off' | 'shadow' | 'shadow+' | 'on' | 'on+';

/** AI gate doesn't have a meaningful shadow mode (its action is structural). */
export type BinaryMode = 'off' | 'on' | 'on+';

/** True iff the mode counts as a non-acting log-only state. */
export function isShadowMode(mode: Mode | BinaryMode): boolean {
  return mode === 'shadow' || mode === 'shadow+';
}

/** True iff the mode actually performs Reddit-visible actions. */
export function isLiveMode(mode: Mode | BinaryMode): boolean {
  return mode === 'on' || mode === 'on+';
}

/** True iff the mode should mirror its log line to Discord. */
export function shouldMirrorToDiscord(mode: Mode | BinaryMode): boolean {
  return mode === 'shadow+' || mode === 'on+';
}

/** Feature names used in structured log lines. */
export type FeatureName =
  | 'ai-gate'
  | 'ai-topic-days'
  | 'flair-required'
  | 'op-engagement'
  | 'min-karma';

export const SETTING_DEFAULTS = {
  aiGateMode: 'off' as BinaryMode,
  aiTopicDayMode: 'off' as Mode,
  flairPostMode: 'off' as Mode,
  flairCommentMode: 'off' as Mode,
  engagementMode: 'off' as Mode,
  minKarmaMode: 'off' as Mode,
  minKarmaThreshold: 10,
  engagementWindowMinutes: 120,
  engagementMinComments: 10,
  discordWebhookUrl: '',
} as const;

/**
 * Post link-flair text values (case-insensitive) that mark a post as
 * AI-topic. Posts with one of these flairs are only allowed on the days
 * listed in AI_TOPIC_ALLOWED_DAYS_UTC.
 */
export const AI_TOPIC_FLAIR_NAMES: ReadonlySet<string> = new Set([
  'ai/llm',
]);

/**
 * UTC day-of-week (0 = Sunday … 6 = Saturday) on which AI-topic posts are
 * permitted. Currently Wednesday (3) and Saturday (6).
 */
export const AI_TOPIC_ALLOWED_DAYS_UTC: ReadonlySet<number> = new Set([3, 6]);

/** State of the Track A multipurpose sticky. */
export type StickyState = 'awaiting-ai' | 'flair-psa' | 'confirmed';

/** Redis key builders. Centralized so debug-state can iterate them. */
export const REDIS_KEYS = {
  botSticky: (postId: string) => `bot-sticky:${postId}`,
  engagementSticky: (postId: string) => `engagement-sticky:${postId}`,
  engage: (postId: string) => `engage:${postId}`,
  removedByUs: (postId: string) => `removed-by-us:${postId}`,
  processedPostSubmit: (postId: string) => `processed:postsubmit:${postId}`,
  modsCache: 'mods:cache',
} as const;

/** TTLs in seconds. */
export const TTL = {
  botSticky: 24 * 60 * 60, // 24h
  engagementSticky: 24 * 60 * 60, // 24h
  engage: 25 * 60 * 60, // slightly longer than engagement window upper bound
  removedByUs: 24 * 60 * 60,
  processedPostSubmit: 60 * 60, // 1h idempotency
  modsCache: 15 * 60, // 15 min
} as const;

/** Scheduler job name registered in devvit.json -> scheduler.tasks. */
export const SCHEDULED_JOB_NAMES = {
  opEngagementCheck: 'op-engagement-check',
} as const;

/**
 * Bot copy. Kept here so wording changes don't touch logic files.
 * Plain text Reddit markdown.
 */
export const STICKY_BODIES: Record<StickyState, string> = {
  'awaiting-ai':
    'AI disclosure required.\n\n' +
    "r/ExperiencedDevs requires authors to disclose AI-tool usage. Please reply to this comment describing whether and how you used AI tools, including spelling and translation ones, for the content of this post. If you did not use any AI tools, just say you didn't.\n\n" +
    'Your post is currently removed and will be automatically re-approved once you reply here.',
  'flair-psa':
    'IMPORTANT: r/ExperiencedDevs requires all commenters to have a flair. ' +
    'If you do not have a flair with your role, your comment will be automatically, silently removed. ' +
    'Set a flair in the subreddit sidebar or ... menu on mobile.',
  confirmed:
    'AI usage disclosure provided by OP, see the reply to this comment.',
};

export const ENGAGEMENT_REMOVAL_BODY = (windowMinutes: number) =>
  'Post automatically removed.\n\n' +
  'r/ExperiencedDevs requires the original poster to participate in the discussion, ' +
  `but they made no comments within ${windowMinutes} minutes. ` +
  'If you comment anywhere on the post, it will be automatically re-approved.';

/** Removal reasons attached to mod actions / removal notes. */
export const REMOVAL_REASONS = {
  minKarma:
    'Post automatically removed.\n\n' +
    'r/ExperiencedDevs requires all posters to participate by commenting in the sub before they are eligible to post. ' +
    'Comment on another post some and try again.',
  flairMissing:
    'Post automatically removed.\n\n' +
    'r/ExperiencedDevs requires all posters to have a flair with your role. ' +
    'Since you do not have one, your post was removed. ' +
    'Set a flair in the subreddit sidebar or ... menu on mobile, and then post again.',
  aiTopicDay:
    'This flair is only allowed on wednesday, saturday (UTC). ' +
    'Please repost on an allowed day. ' +
    'Intentionally trying to circumvent this rule will result in a suspension. ' +
    'See: https://www.reddit.com/r/ExperiencedDevs/comments/1rfhdrg/moderation_changes/',
} as const;

/**
 * removedByCategory values that indicate a human moderator (or admin)
 * performed the removal, meaning the bot must not re-approve.
 */
export const HUMAN_MOD_REMOVAL_CATEGORIES: ReadonlySet<string> = new Set([
  'moderator',
  'anti_evil_ops',
  'community_ops',
  'content_takedown',
  'copyright_takedown',
]);
