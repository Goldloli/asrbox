export type TranscriptDiffLine = {
  kind: 'same' | 'added' | 'removed' | 'summary';
  text: string;
};

export function diffTextLines(
  previousText: string,
  currentText: string,
  options: { maxCells?: number; maxLines?: number } = {},
): TranscriptDiffLine[] {
  const previousLines = previousText.split('\n');
  const currentLines = currentText.split('\n');
  const maxCells = options.maxCells ?? 250_000;
  const maxLines = options.maxLines ?? 200;

  if (previousLines.length * currentLines.length > maxCells) {
    const sideLimit = Math.max(1, Math.floor((maxLines - 1) / 2));
    return [
      ...previousLines.slice(0, sideLimit).map((text) => ({ kind: 'removed' as const, text })),
      {
        kind: 'summary' as const,
        text: `Diff simplified: ${previousLines.length} previous lines → ${currentLines.length} current lines`,
      },
      ...currentLines.slice(0, sideLimit).map((text) => ({ kind: 'added' as const, text })),
    ].slice(0, maxLines);
  }

  const rows = previousLines.length + 1;
  const columns = currentLines.length + 1;
  const table = Array.from({ length: rows }, () => new Uint32Array(columns));

  for (let row = previousLines.length - 1; row >= 0; row -= 1) {
    for (let column = currentLines.length - 1; column >= 0; column -= 1) {
      table[row][column] = previousLines[row] === currentLines[column]
        ? table[row + 1][column + 1] + 1
        : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }

  const result: TranscriptDiffLine[] = [];
  let row = 0;
  let column = 0;
  while (row < previousLines.length && column < currentLines.length) {
    if (previousLines[row] === currentLines[column]) {
      result.push({ kind: 'same', text: previousLines[row] });
      row += 1;
      column += 1;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      result.push({ kind: 'removed', text: previousLines[row] });
      row += 1;
    } else {
      result.push({ kind: 'added', text: currentLines[column] });
      column += 1;
    }
  }
  while (row < previousLines.length) {
    result.push({ kind: 'removed', text: previousLines[row] });
    row += 1;
  }
  while (column < currentLines.length) {
    result.push({ kind: 'added', text: currentLines[column] });
    column += 1;
  }

  return result.slice(0, maxLines);
}
