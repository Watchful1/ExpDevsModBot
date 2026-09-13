import { describe, it, expect } from 'vitest';
import { matchSignature, parseSignatures } from './signatures';
import { DEFAULT_REDACTION_SIGNATURES } from '../../config';

// The exact body shape observed in the sub: filler words, newline, footer
// with a markdown link.
const REDACT_BODY =
  'Saffron gaze detail airport zephyr full judicious stocking\n\n' +
  'This post was anonymized with [Redact](https://redact.dev)';

describe('parseSignatures', () => {
  it('compiles one case-insensitive pattern per line', () => {
    const { patterns, invalid } = parseSignatures('foo\nBAR');
    expect(patterns).toHaveLength(2);
    expect(invalid).toEqual([]);
    expect(patterns[0]?.flags).toContain('i');
  });

  it('ignores blank lines, whitespace, and # comments', () => {
    const { patterns } = parseSignatures('\n  foo  \n# a comment\n\nbar\n');
    expect(patterns.map((p) => p.source)).toEqual(['foo', 'bar']);
  });

  it('skips a malformed line without dropping the rest', () => {
    const { patterns, invalid } = parseSignatures('good\n[unclosed\nalso good');
    expect(patterns.map((p) => p.source)).toEqual(['good', 'also good']);
    expect(invalid).toEqual(['[unclosed']);
  });

  it('returns empty for an empty setting', () => {
    expect(parseSignatures('')).toEqual({ patterns: [], invalid: [] });
  });
});

describe('matchSignature', () => {
  const { patterns: defaults } = parseSignatures(DEFAULT_REDACTION_SIGNATURES);

  it('default signature matches the observed Redact footer', () => {
    expect(matchSignature(REDACT_BODY, defaults)).toBe(
      'anonymized with \\[?Redact'
    );
  });

  it('default signature matches the footer without the markdown link', () => {
    expect(
      matchSignature('This post was anonymized with Redact', defaults)
    ).not.toBeNull();
  });

  it('is case-insensitive', () => {
    expect(
      matchSignature('ANONYMIZED WITH REDACT', defaults)
    ).not.toBeNull();
  });

  it('does not match an ordinary comment', () => {
    expect(
      matchSignature(
        'I redacted the config before posting, but the gist is the same.',
        defaults
      )
    ).toBeNull();
  });

  it('returns the first matching pattern source', () => {
    const { patterns } = parseSignatures('nomatch\nRedact\nanonymized');
    expect(matchSignature(REDACT_BODY, patterns)).toBe('Redact');
  });

  it('returns null with no patterns', () => {
    expect(matchSignature(REDACT_BODY, [])).toBeNull();
  });
});
