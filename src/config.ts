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
  | 'flair-required'
  | 'op-engagement'
  | 'min-karma';

export const SETTING_DEFAULTS = {
  aiGateMode: 'off' as BinaryMode,
  flairPostMode: 'off' as Mode,
  flairCommentMode: 'off' as Mode,
  engagementMode: 'off' as Mode,
  minKarmaMode: 'off' as Mode,
  minKarmaThreshold: 10,
  engagementWindowMinutes: 120,
  engagementMinComments: 10,
  discordWebhookUrl: '',
} as const;

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
    '**AI disclosure required.**\n\n' +
    "r/ExperiencedDevs requires authors to disclose AI-tool usage. Please reply to **this comment** describing whether and how you used AI tools (e.g. ChatGPT, Copilot, Cursor) for the content of this post. Any reply will do — just confirm.\n\n" +
    'Your post is currently removed and will be re-approved once you reply here.',
  'flair-psa':
    '**Reminder:** comments here require a user flair to remain visible. ' +
    "If your comment is removed, set a flair via the subreddit sidebar (or `…` menu on mobile) and try again.",
  confirmed:
    '**AI disclosure provided by OP. Thanks!** Your post is visible to the sub.',
};

export const ENGAGEMENT_REMOVAL_BODY = (windowMinutes: number) =>
  '**Post removed: OP did not engage.**\n\n' +
  `r/ExperiencedDevs requires the original poster to participate in the discussion. ` +
  `This post had comments waiting but no reply from OP within ${windowMinutes} minutes of posting, so it has been removed.\n\n` +
  'If you comment on your post now, it will be re-approved automatically.';

/** Removal reasons attached to mod actions / removal notes. */
export const REMOVAL_REASONS = {
  minKarma: (threshold: number) =>
    `Your account does not meet the minimum subreddit karma threshold (${threshold}) for r/ExperiencedDevs. Participate in comments first, then try posting again.`,
  flairMissing:
    'r/ExperiencedDevs requires a user flair to post or comment. Please set one via the subreddit sidebar.',
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
