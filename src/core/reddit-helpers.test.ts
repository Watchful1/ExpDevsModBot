import { describe, expect, it } from 'vitest';
import { isRemovedByHumanModCategory, type PostLike } from './reddit-helpers';

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
