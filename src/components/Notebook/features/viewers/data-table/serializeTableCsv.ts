import Papa from 'papaparse';

export type TableCellValue = string | number | boolean | null | undefined;

/** Column labels belong to the grid; every source row, including headers, is already in data. */
export function serializeTableCsv(
  rows: readonly Readonly<Record<string, TableCellValue>>[],
  columns: readonly { readonly key: string }[]
): string {
  return Papa.unparse(
    rows.map((row) => columns.map(({ key }) => String(row[key] ?? ''))),
    { header: false, newline: '\n' }
  );
}
