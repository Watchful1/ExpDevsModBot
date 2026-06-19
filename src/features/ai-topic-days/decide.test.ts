import { describe, it, expect } from 'vitest';
import type { T3 } from '@devvit/shared-types/tid.js';
import { decide } from './on-post-submit';
import type { ResolvedSettings } from '../../core/settings';
import type { DispatchContext, PostSubmitInput } from '../types';
import { SETTING_DEFAULTS } from '../../config';

function settingsFor(mode: ResolvedSettings['aiTopicDayMode']): ResolvedSettings {
  return {
    ...SETTING_DEFAULTS,
    aiTopicDayMode: mode,
  };
}

function inputWith(flair: string | undefined): PostSubmitInput {
  return {
    postId: 't3_abc' as T3,
    authorId: 't2_xyz',
    authorName: 'alice',
    authorHasFlair: true,
    postFlairText: flair,
  };
}

const NO_PRIOR: DispatchContext = { alreadyRemoved: false };

// Reference dates (UTC). getUTCDay: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6.
const WED = new Date(Date.UTC(2026, 5, 17, 12, 0, 0)); // 2026-06-17 Wed
const THU = new Date(Date.UTC(2026, 5, 18, 12, 0, 0)); // 2026-06-18 Thu
const SAT = new Date(Date.UTC(2026, 5, 20, 12, 0, 0)); // 2026-06-20 Sat
const SUN = new Date(Date.UTC(2026, 5, 21, 12, 0, 0)); // 2026-06-21 Sun

describe('ai-topic-days decide()', () => {
  it('noops when mode is off, even on a wrong day with AI flair', () => {
    const d = decide(inputWith('AI/LLM'), settingsFor('off'), NO_PRIOR, THU);
    expect(d.kind).toBe('noop');
  });

  it('noops when the post was already removed by an earlier feature', () => {
    const d = decide(inputWith('AI/LLM'), settingsFor('on'), { alreadyRemoved: true }, THU);
    expect(d.kind).toBe('noop');
  });

  it('noops when there is no link flair', () => {
    const d = decide(inputWith(undefined), settingsFor('on'), NO_PRIOR, THU);
    expect(d.kind).toBe('noop');
  });

  it('noops when the link flair is not in the AI-topic set', () => {
    const d = decide(inputWith('Discussion'), settingsFor('on'), NO_PRIOR, THU);
    expect(d.kind).toBe('noop');
  });

  it('noops on Wednesday with AI flair', () => {
    const d = decide(inputWith('AI/LLM'), settingsFor('on'), NO_PRIOR, WED);
    expect(d.kind).toBe('noop');
  });

  it('noops on Saturday with AI flair', () => {
    const d = decide(inputWith('AI/LLM'), settingsFor('on'), NO_PRIOR, SAT);
    expect(d.kind).toBe('noop');
  });

  it('removes on Thursday with AI/LLM flair', () => {
    const d = decide(inputWith('AI/LLM'), settingsFor('on'), NO_PRIOR, THU);
    expect(d.kind).toBe('remove');
    if (d.kind === 'remove') {
      expect(d.flairText).toBe('AI/LLM');
      expect(d.dayOfWeekUtc).toBe(4);
    }
  });

  it('removes on Sunday with AI flair (shadow mode still decides to remove)', () => {
    const d = decide(inputWith('AI/LLM'), settingsFor('shadow'), NO_PRIOR, SUN);
    expect(d.kind).toBe('remove');
  });

  it('matches AI flair case-insensitively', () => {
    const d = decide(inputWith('ai/llm'), settingsFor('on'), NO_PRIOR, THU);
    expect(d.kind).toBe('remove');
  });
});
