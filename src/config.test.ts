import { describe, expect, it } from 'vitest';
import { isLiveMode, isShadowMode, shouldMirrorToDiscord } from './config';

describe('isShadowMode', () => {
  it('returns true for shadow variants', () => {
    expect(isShadowMode('shadow')).toBe(true);
    expect(isShadowMode('shadow+')).toBe(true);
  });
  it('returns false for off and live modes', () => {
    expect(isShadowMode('off')).toBe(false);
    expect(isShadowMode('on')).toBe(false);
    expect(isShadowMode('on+')).toBe(false);
  });
});

describe('isLiveMode', () => {
  it('returns true for live variants', () => {
    expect(isLiveMode('on')).toBe(true);
    expect(isLiveMode('on+')).toBe(true);
  });
  it('returns false for off and shadow modes', () => {
    expect(isLiveMode('off')).toBe(false);
    expect(isLiveMode('shadow')).toBe(false);
    expect(isLiveMode('shadow+')).toBe(false);
  });
});

describe('shouldMirrorToDiscord', () => {
  it('returns true for the + suffixed modes', () => {
    expect(shouldMirrorToDiscord('shadow+')).toBe(true);
    expect(shouldMirrorToDiscord('on+')).toBe(true);
  });
  it('returns false for plain modes', () => {
    expect(shouldMirrorToDiscord('off')).toBe(false);
    expect(shouldMirrorToDiscord('shadow')).toBe(false);
    expect(shouldMirrorToDiscord('on')).toBe(false);
  });
});
