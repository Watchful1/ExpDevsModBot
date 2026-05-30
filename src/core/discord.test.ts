import { describe, expect, it } from 'vitest';
import { formatDiscordSentence } from './discord';

describe('formatDiscordSentence', () => {
  it('formats a live post removal with link and user', () => {
    const s = formatDiscordSentence({
      feature: 'min-karma',
      action: 'remove-post',
      mode: 'on',
      postId: 't3_abc123',
      authorName: 'Alice',
      reason: 'karma 3 < threshold 10',
    });
    expect(s).toBe(
      'Removed [post](<https://reddit.com/comments/abc123>) by u/Alice — karma 3 < threshold 10'
    );
  });

  it('uses "Would remove" for shadow modes', () => {
    const sShadow = formatDiscordSentence({
      feature: 'flair-required',
      action: 'remove-post',
      mode: 'shadow',
      postId: 't3_xyz',
      authorName: 'Bob',
      reason: 'no user flair',
    });
    const sShadowPlus = formatDiscordSentence({
      feature: 'flair-required',
      action: 'remove-post',
      mode: 'shadow+',
      postId: 't3_xyz',
      authorName: 'Bob',
      reason: 'no user flair',
    });
    expect(sShadow).toContain('Would remove');
    expect(sShadowPlus).toContain('Would remove');
  });

  it('formats comment removal with both post and comment links', () => {
    const s = formatDiscordSentence({
      feature: 'flair-required',
      action: 'remove-comment',
      mode: 'on',
      postId: 't3_p',
      commentId: 't1_c',
      authorName: 'Carol',
      reason: 'no user flair',
    });
    expect(s).toBe(
      'Removed [comment](<https://reddit.com/comments/p/_/c>) on [post](<https://reddit.com/comments/p>) by u/Carol — no user flair'
    );
  });

  it('formats engagement removal', () => {
    const s = formatDiscordSentence({
      feature: 'op-engagement',
      action: 'engagement-remove',
      mode: 'on',
      postId: 't3_eee',
      authorName: 'Dave',
      reason: 'OP silent at window expiry',
    });
    expect(s).toBe(
      'Engagement-removed [post](<https://reddit.com/comments/eee>) by u/Dave — OP silent at window expiry'
    );
  });

  it('formats AI-gate re-approval', () => {
    const s = formatDiscordSentence({
      feature: 'ai-gate',
      action: 'reapprove-post',
      mode: 'on',
      postId: 't3_xyz',
      authorName: 'Eve',
      reason: 'OP replied to awaiting-ai sticky',
    });
    expect(s).toBe(
      'Re-approved [post](<https://reddit.com/comments/xyz>) by u/Eve — OP replied to awaiting-ai sticky'
    );
  });

  it('formats engagement re-approval distinctly from AI re-approval', () => {
    const s = formatDiscordSentence({
      feature: 'op-engagement',
      action: 'reapprove-post',
      mode: 'on+',
      postId: 't3_qqq',
      authorName: 'Frank',
      reason: 'OP commented after engagement removal',
    });
    expect(s).toBe(
      'Re-approved [post](<https://reddit.com/comments/qqq>) by u/Frank — OP commented after engagement removal'
    );
  });

  it('returns null for skip and schedule-check actions', () => {
    const skip = formatDiscordSentence({
      feature: 'op-engagement',
      action: 'skip',
      mode: 'on',
      reason: 'already removed',
    });
    const schedule = formatDiscordSentence({
      feature: 'op-engagement',
      action: 'schedule-check',
      mode: 'on',
      reason: 'scheduled for 2h',
    });
    expect(skip).toBeNull();
    expect(schedule).toBeNull();
  });
});
