import * as XLSX from 'xlsx-js-style';
import type { TableCellValue } from './CsvCodec';
import type { CellFormat } from './SpreadsheetSnapshot';
import { xlsxCellFormat } from './XlsxCellFormat';

/** Owns the original workbook so grid edits do not discard undisplayed worksheets. */
export class XlsxDocument {
  private constructor(private readonly workbook: XLSX.WorkBook) {}

  static fromBase64(content: string): XlsxDocument {
    const workbook = XLSX.read(content, {
      type: 'base64',
      cellStyles: true,
      cellNF: true,
      cellDates: true,
      sheetStubs: true,
    });
    if (!workbook.SheetNames.length) throw new Error('Workbook has no worksheets');
    return new XlsxDocument(workbook);
  }

  get worksheet(): XLSX.WorkSheet {
    return this.workbook.Sheets[this.workbook.SheetNames[0]];
  }

  serialize(
    rows: readonly Readonly<Record<string, TableCellValue>>[],
    columns: readonly { readonly key: string }[],
    formats: Readonly<Record<string, CellFormat>> = {}
  ): string {
    const workbook = structuredClone(this.workbook);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const original = this.worksheet;
    const range = XLSX.utils.decode_range(original['!ref'] || 'A1');
    // Replace the displayed rectangle, retaining worksheet properties and other sheets.
    for (const address of Object.keys(sheet)) {
      if (!address.startsWith('!')) delete sheet[address];
    }
    rows.forEach((row, r) =>
      columns.forEach(({ key }, c) => {
        const address = XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c });
        const value = row[key] ?? '';
        const previous = original[address] as XLSX.CellObject | undefined;
        const displayed = previous?.w ?? String(previous?.v ?? '');
        let cell: XLSX.CellObject;
        if (previous && String(value) === displayed) {
          cell = structuredClone(previous);
        } else {
          cell = { ...previous, t: 's', v: String(value) };
          delete cell.f;
          delete cell.F;
          delete cell.w;
          delete cell.h;
          delete cell.r;
          if (typeof value === 'boolean') {
            cell.t = 'b';
            cell.v = value;
          } else if (typeof value === 'number') {
            cell.t = 'n';
            cell.v = value;
          }
        }
        const format = formats[`${r}:${c}`];
        if (format) cell.s = xlsxCellFormat(cell.s, format);
        sheet[address] = cell;
      })
    );
    if (rows.length && columns.length) {
      sheet['!ref'] = XLSX.utils.encode_range({
        s: range.s,
        e: {
          r: range.s.r + rows.length - 1,
          c: range.s.c + columns.length - 1,
        },
      });
      sheet['!merges'] = (sheet['!merges'] || []).filter(
        (merge) => merge.e.r < range.s.r + rows.length && merge.e.c < range.s.c + columns.length
      );
    } else {
      delete sheet['!ref'];
      delete sheet['!merges'];
    }
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'base64', cellStyles: true });
  }
}
