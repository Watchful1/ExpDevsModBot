import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import { redis } from '@devvit/web/server';
import { REDIS_KEYS, isShadowMode } from '../config';
import { getSettings } from '../core/settings';
import { runBackfill } from '../features/redaction-cleanup/backfill';

export const menu = new Hono();

/**
 * Subreddit-level mod menu: sweep the "edited" mod listing for comments that
 * match a redaction signature and remove them (or, in shadow mode, count what
 * would be removed). Honors the same `redactionMode` setting as the trigger,
 * so the menu is never a way to bypass a feature that's switched off.
 */
menu.post('/redaction-backfill', async (c) => {
  await c.req.json<MenuItemRequest>();
  const settings = await getSettings();

  if (settings.redactionMode === 'off') {
    return c.json<UiResponse>(
      { showToast: 'Redaction cleanup is off — enable it in app settings first.' },
      200
    );
  }

  const r = await runBackfill(settings);
  const shadow = isShadowMode(settings.redactionMode);
  const verb = shadow ? 'would remove' : 'removed';
  // In shadow mode apply() never removes, so the actionable count is the
  // matches that weren't already gone.
  const actioned = shadow ? r.matched - r.alreadyRemoved : r.removed;
  const summary =
    `Scanned ${r.scanned}, matched ${r.matched}, ${verb} ${actioned}` +
    (r.alreadyRemoved ? `, ${r.alreadyRemoved} already removed` : '') +
    (r.exempt ? `, ${r.exempt} exempt` : '') +
    (r.truncated ? ' — hit scan cap, click again to continue' : '');

  return c.json<UiResponse>({ showToast: summary }, 200);
});

/**
 * Mod-only diagnostic menu: dumps every Redis key the modbot stores for the
 * targeted post, formatted as a single multi-line toast.
 *
 * Useful during shadow-mode rollout for confirming the bot's state matches
 * expectations without redeploying or hitting the Devvit logs.
 */
menu.post('/debug-state', async (c) => {
  const req = await c.req.json<MenuItemRequest>();
  const postId = req.targetId;

  const [
    botSticky,
    engagementSticky,
    engage,
    removedByUs,
    processedPostSubmit,
  ] = await Promise.all([
    redis.get(REDIS_KEYS.botSticky(postId)),
    redis.get(REDIS_KEYS.engagementSticky(postId)),
    redis.get(REDIS_KEYS.engage(postId)),
    redis.get(REDIS_KEYS.removedByUs(postId)),
    redis.get(REDIS_KEYS.processedPostSubmit(postId)),
  ]);

  // Full dump goes to devvit logs (toasts are length-capped and truncate).
  const dump = {
    postId,
    botSticky: botSticky ?? null,
    engagementSticky: engagementSticky ?? null,
    engage: engage ?? null,
    removedByUs: removedByUs ?? null,
    processedPostSubmit: processedPostSubmit ?? null,
  };
  console.log('[modbot] [debug-state]', JSON.stringify(dump));

  // Short toast summary: one char per key, so the whole line fits.
  // P = processed:postsubmit, R = removed-by-us, S = bot-sticky,
  // E = engage scheduled, T = engagement (Track B) sticky.
  const flag = (v: string | undefined) => (v ? '✓' : '·');
  const summary =
    `P${flag(processedPostSubmit)} ` +
    `R${flag(removedByUs)} ` +
    `S${flag(botSticky)} ` +
    `E${flag(engage)} ` +
    `T${flag(engagementSticky)} ` +
    `— full dump in devvit logs`;

  return c.json<UiResponse>({ showToast: summary }, 200);
});
