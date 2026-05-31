import { describe, expect, it } from 'vitest';
import { SETTING_DEFAULTS } from '../config';
import { _resolveForTests } from './settings';

describe('settings.resolveFromRaw', () => {
  it('falls back to defaults when raw is empty', () => {
    const r = _resolveForTests({});
    expect(r.aiGateMode).toBe(SETTING_DEFAULTS.aiGateMode);
    expect(r.flairPostMode).toBe(SETTING_DEFAULTS.flairPostMode);
    expect(r.flairCommentMode).toBe(SETTING_DEFAULTS.flairCommentMode);
    expect(r.engagementMode).toBe(SETTING_DEFAULTS.engagementMode);
    expect(r.minKarmaMode).toBe(SETTING_DEFAULTS.minKarmaMode);
    expect(r.minKarmaThreshold).toBe(SETTING_DEFAULTS.minKarmaThreshold);
    expect(r.engagementWindowMinutes).toBe(
      SETTING_DEFAULTS.engagementWindowMinutes
    );
    expect(r.engagementMinComments).toBe(
      SETTING_DEFAULTS.engagementMinComments
    );
  });

  it('passes through valid values', () => {
    const r = _resolveForTests({
      aiGateMode: 'on',
      flairPostMode: 'shadow',
      flairCommentMode: 'on',
      engagementMode: 'on',
      minKarmaMode: 'shadow',
      minKarmaThreshold: 50,
      engagementWindowMinutes: 30,
      engagementMinComments: 5,
    });
    expect(r.aiGateMode).toBe('on');
    expect(r.flairPostMode).toBe('shadow');
    expect(r.flairCommentMode).toBe('on');
    expect(r.engagementMode).toBe('on');
    expect(r.minKarmaMode).toBe('shadow');
    expect(r.minKarmaThreshold).toBe(50);
    expect(r.engagementWindowMinutes).toBe(30);
    expect(r.engagementMinComments).toBe(5);
  });

  it('rejects invalid mode strings and falls back', () => {
    const r = _resolveForTests({
      aiGateMode: 'maybe',
      flairPostMode: 'someday',
      flairCommentMode: 'never',
      minKarmaThreshold: 'not-a-number',
    });
    expect(r.aiGateMode).toBe(SETTING_DEFAULTS.aiGateMode);
    expect(r.flairPostMode).toBe(SETTING_DEFAULTS.flairPostMode);
    expect(r.flairCommentMode).toBe(SETTING_DEFAULTS.flairCommentMode);
    expect(r.minKarmaThreshold).toBe(SETTING_DEFAULTS.minKarmaThreshold);
  });

  it('rejects shadow for the binary aiGateMode', () => {
    const r = _resolveForTests({ aiGateMode: 'shadow' });
    expect(r.aiGateMode).toBe(SETTING_DEFAULTS.aiGateMode);
  });

  it('unwraps Devvit select-as-array values', () => {
    const r = _resolveForTests({
      aiGateMode: ['on'],
      flairPostMode: ['shadow'],
      flairCommentMode: ['on+'],
      engagementMode: ['on'],
      minKarmaMode: ['off'],
    });
    expect(r.aiGateMode).toBe('on');
    expect(r.flairPostMode).toBe('shadow');
    expect(r.flairCommentMode).toBe('on+');
    expect(r.engagementMode).toBe('on');
    expect(r.minKarmaMode).toBe('off');
  });

  it('rejects NaN/Infinity for numeric settings', () => {
    const r = _resolveForTests({
      minKarmaThreshold: NaN,
      engagementWindowMinutes: Infinity,
    });
    expect(r.minKarmaThreshold).toBe(SETTING_DEFAULTS.minKarmaThreshold);
    expect(r.engagementWindowMinutes).toBe(
      SETTING_DEFAULTS.engagementWindowMinutes
    );
  });

  it('accepts shadow+ for the shadow-capable features', () => {
    const r = _resolveForTests({
      flairPostMode: 'shadow+',
      flairCommentMode: ['shadow+'],
      engagementMode: 'shadow+',
      minKarmaMode: 'shadow+',
    });
    expect(r.flairPostMode).toBe('shadow+');
    expect(r.flairCommentMode).toBe('shadow+');
    expect(r.engagementMode).toBe('shadow+');
    expect(r.minKarmaMode).toBe('shadow+');
  });

  it('accepts on+ for all features', () => {
    const r = _resolveForTests({
      aiGateMode: 'on+',
      flairPostMode: ['on+'],
      flairCommentMode: 'on+',
      engagementMode: 'on+',
      minKarmaMode: 'on+',
    });
    expect(r.aiGateMode).toBe('on+');
    expect(r.flairPostMode).toBe('on+');
    expect(r.flairCommentMode).toBe('on+');
    expect(r.engagementMode).toBe('on+');
    expect(r.minKarmaMode).toBe('on+');
  });

  it('rejects shadow+ for the binary aiGateMode', () => {
    const r = _resolveForTests({ aiGateMode: 'shadow+' });
    expect(r.aiGateMode).toBe(SETTING_DEFAULTS.aiGateMode);
  });

  it('rejects the no-longer-supported +posts variants', () => {
    const r = _resolveForTests({
      flairPostMode: 'shadow+posts',
      flairCommentMode: 'on+posts',
    });
    expect(r.flairPostMode).toBe(SETTING_DEFAULTS.flairPostMode);
    expect(r.flairCommentMode).toBe(SETTING_DEFAULTS.flairCommentMode);
  });

  it('coerces discordWebhookUrl as a string', () => {
    const r = _resolveForTests({
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
    });
    expect(r.discordWebhookUrl).toBe(
      'https://discord.com/api/webhooks/123/abc'
    );
  });

  it('falls back to empty string when discordWebhookUrl is missing', () => {
    const r = _resolveForTests({});
    expect(r.discordWebhookUrl).toBe('');
  });
});
