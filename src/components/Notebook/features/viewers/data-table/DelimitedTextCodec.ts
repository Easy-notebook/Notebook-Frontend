import Papa from 'papaparse';

export type TableCellValue = string | number | boolean | null | undefined;

/** Shared quoting and record-boundary rules for files and spreadsheet clipboard text. */
export class DelimitedTextCodec {
  constructor(
    private readonly delimiter: string | undefined,
    private readonly formatName: string
  ) {}

  serialize(rows: readonly (readonly TableCellValue[])[]): string {
    return Papa.unparse(
      rows.map((row) => row.map((value) => String(value ?? ''))),
      {
        delimiter: this.delimiter,
        header: false,
        newline: '\n',
        quotes: (value) => value === '',
      }
    );
  }

  parse(content: string): string[][] {
    if (!content) return [];
    const parsed = Papa.parse<string[]>(content, {
      delimiter: this.delimiter,
      header: false,
      skipEmptyLines: false,
    });
    const errors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
    if (errors.length) throw new Error(`Invalid ${this.formatName}: ${errors[0].message}`);
    if (content.endsWith('\n') || content.endsWith('\r')) parsed.data.pop();
    return parsed.data;
  }
}

export const spreadsheetClipboardCodec = new DelimitedTextCodec('\t', 'TSV');
