import { describe, expect, it } from 'vitest';
import {
  evaluateApprovalGate,
  isRemovedByHumanModCategory,
  type PostLike,
} from './reddit-helpers';

describe('isRemovedByHumanModCategory', () => {
  it.each([
    ['moderator', true],
    ['anti_evil_ops', true],
    ['community_ops', true],
    ['content_takedown', true],
    ['copyright_takedown', true],
    ['author', false],
    ['automod_filtered', false],
    ['deleted', false],
    ['reddit', false],
  ])('category %s -> %s', (category, expected) => {
    const post: PostLike = { removedByCategory: category };
    expect(isRemovedByHumanModCategory(post)).toBe(expected);
  });

  it('returns false when removedByCategory is undefined', () => {
    expect(isRemovedByHumanModCategory({})).toBe(false);
  });
});

describe('evaluateApprovalGate', () => {
  const US = 'expdevsmodbot';

  it('approves when the post is not removed at all', () => {
    const r = evaluateApprovalGate({
      removed: false,
      removedBy: undefined,
      appAccount: US,
      marker: false,
    });
    expect(r.approve).toBe(true);
  });

  it('approves when removedBy is our own app account', () => {
    const r = evaluateApprovalGate({
      removed: true,
      removedBy: 'expdevsmodbot',
      appAccount: US,
      marker: true,
    });
    expect(r.approve).toBe(true);
    expect(r.removedBySomeoneElse).toBe(false);
  });

  it('matches removedBy against the app account case-insensitively', () => {
    const r = evaluateApprovalGate({
      removed: true,
      removedBy: 'ExpDevsModBot',
      appAccount: US,
      marker: false,
    });
    expect(r.approve).toBe(true);
  });

  // Regression: t3_1uydb9b. Our ai-gate removed the post (setting the marker),
  // then u/experienceddevsb removed it, then OP replied to our sticky. The
  // stale marker made the old check approve and undo the other bot's removal.
  it('does NOT approve when another bot removed it, even with our stale marker', () => {
    const r = evaluateApprovalGate({
      removed: true,
      removedBy: 'experienceddevsb',
      appAccount: US,
      marker: true,
    });
    expect(r.approve).toBe(false);
    expect(r.removedBySomeoneElse).toBe(true);
    expect(r.reason).toContain('experienceddevsb');
  });

  it('does NOT approve when a human mod removed it, even with our stale marker', () => {
    const r = evaluateApprovalGate({
      removed: true,
      removedBy: 'Watchful1',
      appAccount: US,
      marker: true,
    });
    expect(r.approve).toBe(false);
    expect(r.removedBySomeoneElse).toBe(true);
  });

  it('falls back to the marker when removedBy is unavailable (marker present)', () => {
    const r = evaluateApprovalGate({
      removed: true,
      removedBy: undefined,
      appAccount: US,
      marker: true,
    });
    expect(r.approve).toBe(true);
    expect(r.removedBySomeoneElse).toBe(false);
  });

  it('does NOT approve when removedBy is unavailable and no marker', () => {
    const r = evaluateApprovalGate({
      removed: true,
      removedBy: undefined,
      appAccount: US,
      marker: false,
    });
    expect(r.approve).toBe(false);
    expect(r.removedBySomeoneElse).toBe(false);
  });

  it('falls back to the marker when the app account is unknown', () => {
    const r = evaluateApprovalGate({
      removed: true,
      removedBy: 'experienceddevsb',
      appAccount: undefined,
      marker: false,
    });
    expect(r.approve).toBe(false);
  });
});
