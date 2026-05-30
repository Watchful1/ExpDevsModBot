import { describe, expect, it } from 'vitest';
import {
  initialStickyStateForPost,
  nextStateAfterAiSatisfied,
} from './sticky';

describe('initialStickyStateForPost', () => {
  it('AI on, flair on -> awaiting-ai', () => {
    expect(
      initialStickyStateForPost({ aiGateOn: true, flairOn: true })
    ).toBe('awaiting-ai');
  });

  it('AI on, flair off -> awaiting-ai', () => {
    expect(
      initialStickyStateForPost({ aiGateOn: true, flairOn: false })
    ).toBe('awaiting-ai');
  });

  it('AI off, flair on -> flair-psa', () => {
    expect(
      initialStickyStateForPost({ aiGateOn: false, flairOn: true })
    ).toBe('flair-psa');
  });

  it('AI off, flair off -> null (no sticky)', () => {
    expect(
      initialStickyStateForPost({ aiGateOn: false, flairOn: false })
    ).toBeNull();
  });
});

describe('nextStateAfterAiSatisfied', () => {
  it('flair on -> flair-psa', () => {
    expect(nextStateAfterAiSatisfied({ flairOn: true })).toBe('flair-psa');
  });

  it('flair off -> confirmed', () => {
    expect(nextStateAfterAiSatisfied({ flairOn: false })).toBe('confirmed');
  });
});
