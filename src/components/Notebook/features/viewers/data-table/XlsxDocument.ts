import * as XLSX from 'xlsx-js-style';
import type { TableCellValue } from './CsvCodec';
import type { CellFormat, SpreadsheetWorkbookState } from './SpreadsheetSnapshot';
import { xlsxCellFormat } from './XlsxCellFormat';
import { restoreWorkbookCellMetadata } from './XlsxCellMetadataReader';
import { transformSpreadsheetFormula } from './SpreadsheetFormula';

/** Owns the original workbook so grid edits do not discard undisplayed worksheets. */
export class XlsxDocument {
  private constructor(private readonly workbook: XLSX.WorkBook) {}

  static fromBase64(content: string): XlsxDocument {
    const workbook = XLSX.read(content, {
      type: 'base64',
      cellStyles: true,
      bookFiles: true,
      cellNF: true,
      cellDates: true,
      sheetStubs: true,
    });
    if (!workbook.SheetNames.length) throw new Error('Workbook has no worksheets');
    restoreWorkbookCellMetadata(workbook);
    return new XlsxDocument(workbook);
  }

  get worksheet(): XLSX.WorkSheet {
    return this.workbook.Sheets[this.workbook.SheetNames[0]];
  }

  /** Project worksheet coordinates into the zero-based grid used by the editor. */
  readGrid(): { cells: (XLSX.CellObject | undefined)[][]; workbook: SpreadsheetWorkbookState } {
    const sheet = this.worksheet;
    if (!sheet['!ref']) return { cells: [], workbook: { sources: {}, merges: [] } };
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const sources: SpreadsheetWorkbookState['sources'] = {};
    const cells = Array.from({ length: range.e.r - range.s.r + 1 }, (_, row) =>
      Array.from({ length: range.e.c - range.s.c + 1 }, (_, column) => {
        const address = XLSX.utils.encode_cell({ r: range.s.r + row, c: range.s.c + column });
        if (sheet[address])
          sources[`${row}:${column}`] = { r: range.s.r + row, c: range.s.c + column };
        return structuredClone(sheet[address] as XLSX.CellObject | undefined);
      })
    );
    const local = (cell: XLSX.CellAddress): XLSX.CellAddress => ({
      r: cell.r - range.s.r,
      c: cell.c - range.s.c,
    });
    const merges = (sheet['!merges'] || []).map(({ s, e }) => ({ s: local(s), e: local(e) }));
    return { cells, workbook: { sources, merges } };
  }

  serialize(
    rows: readonly Readonly<Record<string, TableCellValue>>[],
    columns: readonly { readonly key: string }[],
    formats: Readonly<Record<string, CellFormat>> = {},
    state?: SpreadsheetWorkbookState
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
        const source = state?.sources[`${r}:${c}`];
        const sourceAddress = state
          ? source
            ? XLSX.utils.encode_cell(source)
            : undefined
          : address;
        const previous = sourceAddress
          ? (original[sourceAddress] as XLSX.CellObject | undefined)
          : undefined;
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
      const merges = state
        ? state.merges.map(({ s, e }) => ({
            s: { r: range.s.r + s.r, c: range.s.c + s.c },
            e: { r: range.s.r + e.r, c: range.s.c + e.c },
          }))
        : sheet['!merges'] || [];
      sheet['!merges'] = merges.filter(
        (merge) => merge.e.r < range.s.r + rows.length && merge.e.c < range.s.c + columns.length
      );
    } else {
      delete sheet['!ref'];
      delete sheet['!merges'];
    }
    for (const change of state?.changes ?? []) {
      const edit = {
        ...change,
        index: change.index + (change.axis === 'row' ? range.s.r : range.s.c),
      };
      for (const name of workbook.SheetNames) {
        for (const [key, cell] of Object.entries(workbook.Sheets[name])) {
          if (key.startsWith('!') || !cell.f) continue;
          const formula = transformSpreadsheetFormula(cell.f, name, workbook.SheetNames[0], edit);
          if (formula !== cell.f) {
            cell.f = formula;
          }
        }
      }
      for (const name of workbook.Workbook?.Names ?? []) {
        const scope = name.Sheet === undefined ? '' : workbook.SheetNames[name.Sheet];
        const reference = transformSpreadsheetFormula(
          name.Ref,
          scope,
          workbook.SheetNames[0],
          edit
        );
        name.Ref = reference;
      }
    }
    // Position-sensitive functions and indirect dependents also require recalculation.
    if (state?.changes?.length) {
      for (const sheet of Object.values(workbook.Sheets)) {
        for (const [key, cell] of Object.entries(sheet)) {
          if (key.startsWith('!') || !cell.f) continue;
          delete cell.v;
          delete cell.w;
        }
      }
    }
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'base64', cellStyles: true });
  }
}
