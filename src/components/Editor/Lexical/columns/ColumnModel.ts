export type ColumnMetadata = Readonly<{ version: 1; widths: readonly number[] }>;
export function columnWidths(value: unknown): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > 4 ||
    value.some(
      (width) => typeof width !== 'number' || !Number.isFinite(width) || width < 0.1 || width > 0.9
    ) ||
    Math.abs(value.reduce((sum, width) => sum + width, 0) - 1) > 0.000001
  )
    throw Error('Columns require two to four widths totaling one, each at least ten percent.');
  return Object.freeze([...value]);
}
export function equalColumns(count: number): readonly number[] {
  return columnWidths(Array.from({ length: count }, () => 1 / count));
}
export function parseColumnMetadata(value: unknown): ColumnMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid column metadata');
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || Object.keys(data).length !== 2 || !('widths' in data))
    throw Error('Unsupported column metadata');
  return { version: 1, widths: columnWidths(data.widths) };
}
export function resizeColumns(
  widths: readonly number[],
  index: number,
  delta: number
): readonly number[] {
  columnWidths(widths);
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= widths.length - 1 ||
    !Number.isFinite(delta)
  )
    throw Error('Invalid column divider');
  const next = [...widths];
  const pair = next[index] + next[index + 1];
  next[index] = Math.max(0.1, Math.min(pair - 0.1, next[index] + delta));
  next[index + 1] = pair - next[index];
  // Floating-point subtraction at the minimum must not violate the same invariant.
  if (next[index + 1] < 0.1) {
    next[index + 1] = 0.1;
    next[index] = pair - 0.1;
  }
  return columnWidths(next);
}
export function columnsMarkdown(count: number): string {
  return (
    '<!-- notebook:columns ' +
    JSON.stringify({ version: 1, widths: equalColumns(count) }) +
    ' -->\n\n' +
    Array.from(
      { length: count },
      (_, index) =>
        '<!-- notebook:column -->\n\nColumn ' + (index + 1) + '\n\n<!-- /notebook:column -->'
    ).join('\n\n') +
    '\n\n<!-- /notebook:columns -->'
  );
}
