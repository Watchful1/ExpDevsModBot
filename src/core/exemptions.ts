import { context, redis, reddit } from '@devvit/web/server';
import { REDIS_KEYS, TTL } from '../config';

/**
 * Returns the app account's username, taken from the request context.
 * Used to filter out the bot's own comments from CommentSubmit handlers.
 */
export function getAppAccountUsername(): string | undefined {
  return context.appSlug;
}

/**
 * Pulls the current moderator list for the installed subreddit from Reddit,
 * stores it as a JSON-encoded string array in Redis under REDIS_KEYS.modsCache
 * with a 15-minute TTL, and returns the resolved set.
 *
 * Called by onAppInstall to warm the cache, and lazily by isModerator() when
 * the cached entry has expired.
 */
export async function refreshModeratorCache(): Promise<Set<string>> {
  const subredditName = context.subredditName;
  if (!subredditName) {
    return new Set();
  }

  const usernames: string[] = [];
  try {
    const listing = reddit.getModerators({ subredditName });
    const mods = await listing.all();
    for (const user of mods) {
      if (user.username) usernames.push(user.username.toLowerCase());
    }
  } catch (err) {
    console.warn('refreshModeratorCache failed', err);
    return new Set();
  }

  await redis.set(REDIS_KEYS.modsCache, JSON.stringify(usernames), {
    expiration: new Date(Date.now() + TTL.modsCache * 1000),
  });
  console.log(
    `[modbot] refreshModeratorCache sub=${subredditName} mods=${JSON.stringify(usernames)}`
  );
  return new Set(usernames);
}

async function loadCachedSet(): Promise<Set<string> | null> {
  const raw = await redis.get(REDIS_KEYS.modsCache);
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.map((u) => u.toLowerCase()));
  } catch {
    return null;
  }
}

/**
 * True if `username` is a moderator of the installed subreddit, or is the app
 * account itself (which Devvit also makes a mod).
 *
 * Backed by a Redis-cached list with 15-minute TTL. Cold or expired cache
 * triggers a refresh via the Reddit API.
 */
export async function isModerator(username: string | undefined): Promise<boolean> {
  if (!username) return false;
  const lower = username.toLowerCase();

  const appSlug = context.appSlug?.toLowerCase();
  if (appSlug && lower === appSlug) return true;

  let cached = await loadCachedSet();
  if (!cached) {
    cached = await refreshModeratorCache();
  }
  return cached.has(lower);
}
