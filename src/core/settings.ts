import { settings } from '@devvit/web/server';
import {
  SETTING_DEFAULTS,
  type BinaryMode,
  type Mode,
} from '../config';

/**
 * Strongly typed snapshot of all subreddit-scoped settings the bot reads.
 *
 * Optional in TypeScript because we coalesce against SETTING_DEFAULTS — every
 * call to `getSettings()` returns a fully populated object, never undefined fields.
 */
export type ResolvedSettings = {
  aiGateMode: BinaryMode;
  flairMode: Mode;
  engagementMode: Mode;
  minKarmaMode: Mode;
  minKarmaThreshold: number;
  engagementWindowMinutes: number;
  engagementMinComments: number;
  discordWebhookUrl: string;
};

/**
 * Short cache window — long enough to absorb burst trigger fan-out (e.g. a
 * spike of CommentSubmits all reading settings within a second of each other)
 * but short enough that moderators see setting changes propagate within a few
 * seconds without restarting the app.
 */
const CACHE_TTL_MS = 5_000;

let cached: { value: ResolvedSettings; expiresAt: number } | null = null;

/**
 * Hook for tests; call to drop the in-memory cache so the next getSettings()
 * re-fetches from the settings service.
 */
export function _resetSettingsCacheForTests(): void {
  cached = null;
}

/**
 * Devvit returns `select` field values as `string[]` (a single-element array
 * for single-select), not as a plain string. Normalize.
 */
function unwrapSelect(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function coerceMode(raw: unknown, fallback: Mode): Mode {
  const v = unwrapSelect(raw);
  if (
    v === 'off' ||
    v === 'shadow' ||
    v === 'shadow+' ||
    v === 'shadow+posts' ||
    v === 'on' ||
    v === 'on+' ||
    v === 'on+posts'
  ) {
    return v;
  }
  return fallback;
}

function coerceBinaryMode(raw: unknown, fallback: BinaryMode): BinaryMode {
  const v = unwrapSelect(raw);
  if (v === 'off' || v === 'on' || v === 'on+') {
    return v;
  }
  return fallback;
}

function coerceNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  return fallback;
}

function coerceString(raw: unknown, fallback: string): string {
  if (typeof raw === 'string') return raw;
  return fallback;
}

function resolveFromRaw(raw: Record<string, unknown>): ResolvedSettings {
  return {
    aiGateMode: coerceBinaryMode(raw.aiGateMode, SETTING_DEFAULTS.aiGateMode),
    flairMode: coerceMode(raw.flairMode, SETTING_DEFAULTS.flairMode),
    engagementMode: coerceMode(
      raw.engagementMode,
      SETTING_DEFAULTS.engagementMode
    ),
    minKarmaMode: coerceMode(raw.minKarmaMode, SETTING_DEFAULTS.minKarmaMode),
    minKarmaThreshold: coerceNumber(
      raw.minKarmaThreshold,
      SETTING_DEFAULTS.minKarmaThreshold
    ),
    engagementWindowMinutes: coerceNumber(
      raw.engagementWindowMinutes,
      SETTING_DEFAULTS.engagementWindowMinutes
    ),
    engagementMinComments: coerceNumber(
      raw.engagementMinComments,
      SETTING_DEFAULTS.engagementMinComments
    ),
    discordWebhookUrl: coerceString(
      raw.discordWebhookUrl,
      SETTING_DEFAULTS.discordWebhookUrl
    ),
  };
}

/**
 * Returns the full resolved settings snapshot, hitting an in-memory cache that
 * lives 60s. Settings change rarely; 60s staleness is acceptable and avoids
 * making every trigger fan out to the settings service.
 */
export async function getSettings(): Promise<ResolvedSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await settings.getAll<Record<string, unknown>>()) ?? {};
  } catch (err) {
    console.warn('settings.getAll() failed; falling back to defaults', err);
    raw = {};
  }

  const resolved = resolveFromRaw(raw);
  cached = { value: resolved, expiresAt: now + CACHE_TTL_MS };
  return resolved;
}

/**
 * Test-only helper: resolve a raw blob into a ResolvedSettings without touching
 * the cache or the settings client.
 */
export function _resolveForTests(raw: Record<string, unknown>): ResolvedSettings {
  return resolveFromRaw(raw);
}
