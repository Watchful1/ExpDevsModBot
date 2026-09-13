/**
 * Pure signature parsing + matching for the redaction-cleanup feature.
 * No Reddit or Redis access — everything here is unit-tested directly.
 */

export type ParsedSignatures = {
  patterns: RegExp[];
  /** Lines that failed to compile as a regex; logged once per settings read. */
  invalid: string[];
};

/**
 * Parse the multi-line `redactionSignatures` setting into compiled regexes.
 * One pattern per line; blank lines and lines starting with `#` are ignored.
 * All patterns are case-insensitive. A malformed line is skipped rather than
 * failing the whole list, so one typo in the settings UI can't silently turn
 * the feature off.
 */
export function parseSignatures(raw: string): ParsedSignatures {
  const patterns: RegExp[] = [];
  const invalid: string[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    try {
      patterns.push(new RegExp(line, 'i'));
    } catch {
      invalid.push(line);
    }
  }
  return { patterns, invalid };
}

/**
 * Returns the source of the first pattern that matches `body`, or null.
 * The returned source is what gets logged so a moderator can see which
 * signature fired.
 */
export function matchSignature(
  body: string,
  patterns: RegExp[]
): string | null {
  for (const p of patterns) {
    if (p.test(body)) return p.source;
  }
  return null;
}
