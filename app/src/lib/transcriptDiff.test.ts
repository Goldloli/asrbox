import { describe, expect, test } from 'bun:test';
import { diffTextLines } from './transcriptDiff';

describe('transcript diff', () => {
  test('keeps exact line diff for bounded inputs', () => {
    expect(diffTextLines('a\nb', 'a\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'c' },
    ]);
  });

  test('uses a bounded summary when the LCS matrix would be too large', () => {
    const previous = Array.from({ length: 1000 }, (_, index) => `old-${index}`).join('\n');
    const current = Array.from({ length: 1000 }, (_, index) => `new-${index}`).join('\n');
    const result = diffTextLines(previous, current, { maxCells: 10_000, maxLines: 200 });

    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.some((line) => line.kind === 'summary')).toBe(true);
  });
});
