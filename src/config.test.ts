import { describe, expect, it } from 'vitest';
import { isLiveMode, isShadowMode, shouldMirrorToDiscord } from './config';

describe('isShadowMode', () => {
  it('returns true for all shadow variants', () => {
    expect(isShadowMode('shadow')).toBe(true);
    expect(isShadowMode('shadow+')).toBe(true);
    expect(isShadowMode('shadow+posts')).toBe(true);
  });
  it('returns false for off and live modes', () => {
    expect(isShadowMode('off')).toBe(false);
    expect(isShadowMode('on')).toBe(false);
    expect(isShadowMode('on+')).toBe(false);
    expect(isShadowMode('on+posts')).toBe(false);
  });
});

describe('isLiveMode', () => {
  it('returns true for all live variants', () => {
    expect(isLiveMode('on')).toBe(true);
    expect(isLiveMode('on+')).toBe(true);
    expect(isLiveMode('on+posts')).toBe(true);
  });
  it('returns false for off and shadow modes', () => {
    expect(isLiveMode('off')).toBe(false);
    expect(isLiveMode('shadow')).toBe(false);
    expect(isLiveMode('shadow+')).toBe(false);
    expect(isLiveMode('shadow+posts')).toBe(false);
  });
});

describe('shouldMirrorToDiscord', () => {
  it('returns true for `+` modes on any action', () => {
    expect(shouldMirrorToDiscord('shadow+', 'remove-post')).toBe(true);
    expect(shouldMirrorToDiscord('shadow+', 'remove-comment')).toBe(true);
    expect(shouldMirrorToDiscord('on+', 'remove-post')).toBe(true);
    expect(shouldMirrorToDiscord('on+', 'remove-comment')).toBe(true);
  });

  it('returns true for `+posts` modes only on non-comment actions', () => {
    expect(shouldMirrorToDiscord('shadow+posts', 'remove-post')).toBe(true);
    expect(shouldMirrorToDiscord('shadow+posts', 'reapprove-post')).toBe(true);
    expect(shouldMirrorToDiscord('shadow+posts', 'remove-comment')).toBe(false);
    expect(shouldMirrorToDiscord('on+posts', 'remove-post')).toBe(true);
    expect(shouldMirrorToDiscord('on+posts', 'remove-comment')).toBe(false);
  });

  it('returns false for plain modes regardless of action', () => {
    expect(shouldMirrorToDiscord('off', 'remove-post')).toBe(false);
    expect(shouldMirrorToDiscord('shadow', 'remove-post')).toBe(false);
    expect(shouldMirrorToDiscord('on', 'remove-comment')).toBe(false);
  });
});
