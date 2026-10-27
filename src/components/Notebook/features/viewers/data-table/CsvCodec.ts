import { DelimitedTextCodec, type TableCellValue } from './DelimitedTextCodec';
export type { TableCellValue } from './DelimitedTextCodec';

const csvCodec = new DelimitedTextCodec(undefined, 'CSV');

/** Column labels belong to the grid; every source row, including headers, is already in data. */
export function serializeTableCsv(
  rows: readonly Readonly<Record<string, TableCellValue>>[],
  columns: readonly { readonly key: string }[]
): string {
  return csvCodec.serialize(rows.map((row) => columns.map(({ key }) => row[key])));
}

/** Preserve data rows, excluding only the parser's synthetic final record after a terminator. */
export function parseTableCsv(content: string): string[][] {
  return csvCodec.parse(content);
}
