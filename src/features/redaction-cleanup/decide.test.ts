import { describe, it, expect } from 'vitest';
import type { T3 } from '@devvit/shared-types/tid.js';
import { decide } from './on-comment-update';
import { parseSignatures } from './signatures';
import type { ResolvedSettings } from '../../core/settings';
import type { RedactionCandidate } from '../types';
import { SETTING_DEFAULTS } from '../../config';

function settingsFor(
  mode: ResolvedSettings['redactionMode'],
  signatures: string = SETTING_DEFAULTS.redactionSignatures
): ResolvedSettings {
  return { ...SETTING_DEFAULTS, redactionMode: mode, redactionSignatures: signatures };
}

function candidateWith(body: string): RedactionCandidate {
  return {
    commentId: 't1_abc',
    postId: 't3_xyz' as T3,
    authorName: 'alice',
    body,
  };
}

const REDACTED = 'Teeny worm almond\n\nThis post was anonymized with [Redact](https://redact.dev)';
const NORMAL = 'Have you tried turning it off and on again?';

describe('redaction-cleanup decide()', () => {
  it('noops when mode is off, even on a matching body', () => {
    const s = settingsFor('off');
    const d = decide(candidateWith(REDACTED), s, parseSignatures(s.redactionSignatures));
    expect(d.kind).toBe('noop');
  });

  it('noops when no valid signatures are configured', () => {
    const s = settingsFor('on', '');
    const d = decide(candidateWith(REDACTED), s, parseSignatures(s.redactionSignatures));
    expect(d).toMatchObject({ kind: 'noop', reason: 'no valid signatures configured' });
  });

  it('noops when every configured line is malformed', () => {
    const s = settingsFor('on', '[oops\n(also');
    const d = decide(candidateWith(REDACTED), s, parseSignatures(s.redactionSignatures));
    expect(d.kind).toBe('noop');
  });

  it('noops on a body that matches nothing', () => {
    const s = settingsFor('on');
    const d = decide(candidateWith(NORMAL), s, parseSignatures(s.redactionSignatures));
    expect(d.kind).toBe('noop');
  });

  it('removes on a matching body, reporting which signature fired', () => {
    const s = settingsFor('on');
    const d = decide(candidateWith(REDACTED), s, parseSignatures(s.redactionSignatures));
    expect(d.kind).toBe('remove');
    if (d.kind === 'remove') {
      expect(d.signature).toBe('anonymized with \\[?Redact');
    }
  });

  it('still decides remove in shadow mode (apply is what withholds the action)', () => {
    const s = settingsFor('shadow');
    const d = decide(candidateWith(REDACTED), s, parseSignatures(s.redactionSignatures));
    expect(d.kind).toBe('remove');
  });

  it('honors a mod-added signature for another tool', () => {
    const s = settingsFor('on', 'anonymized with \\[?Redact\noverwritten by PowerDeleteSuite');
    const d = decide(
      candidateWith('This comment has been overwritten by PowerDeleteSuite.'),
      s,
      parseSignatures(s.redactionSignatures)
    );
    expect(d.kind).toBe('remove');
  });
});
