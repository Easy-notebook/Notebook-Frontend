import Papa from 'papaparse';

export type TableCellValue = string | number | boolean | null | undefined;

/** Column labels belong to the grid; every source row, including headers, is already in data. */
export function serializeTableCsv(
  rows: readonly Readonly<Record<string, TableCellValue>>[],
  columns: readonly { readonly key: string }[]
): string {
  return Papa.unparse(
    rows.map((row) => columns.map(({ key }) => String(row[key] ?? ''))),
    { header: false, newline: '\n', quotes: (value) => value === '' }
  );
}

/** Preserve data rows, excluding only the parser's synthetic final record after a terminator. */
export function parseTableCsv(content: string): string[][] {
  if (!content) return [];
  const parsed = Papa.parse<string[]>(content, { header: false, skipEmptyLines: false });
  const errors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (errors.length) throw new Error(`Invalid CSV: ${errors[0].message}`);
  if (content.endsWith('\n') || content.endsWith('\r')) parsed.data.pop();
  return parsed.data;
}
