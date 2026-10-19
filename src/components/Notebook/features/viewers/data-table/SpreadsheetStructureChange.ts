import { getExcelColumnName } from './SpreadsheetCoordinates';
import type { SpreadsheetSnapshot, GridRange } from './SpreadsheetSnapshot';

/** One coordinate transformation shared by values, formats, source identities and merge geometry. */
export class SpreadsheetStructureChange {
  constructor(
    private readonly axis: 'row' | 'column',
    private readonly kind: 'insert' | 'delete',
    private readonly index: number
  ) {}

  mapIndex(previous: number): number | null {
    if (this.kind === 'insert') return previous >= this.index ? previous + 1 : previous;
    if (previous === this.index) return null;
    return previous > this.index ? previous - 1 : previous;
  }

  apply(source: SpreadsheetSnapshot): SpreadsheetSnapshot {
    const size = this.axis === 'row' ? source.data.length : source.columns.length;
    const maximum = this.kind === 'insert' ? size : size - 1;
    if (!Number.isInteger(this.index) || this.index < 0 || this.index > maximum)
      throw new Error('Invalid structural edit position');
    const cellFormats = this.mapCells(source.cellFormats);
    const workbook = source.workbook
      ? {
          workbook: {
            sources: this.mapCells(source.workbook.sources),
            merges: source.workbook.merges.flatMap((range) => {
              const mapped = this.mapRange(range);
              return mapped ? [mapped] : [];
            }),
          },
        }
      : {};
    if (this.axis === 'row') {
      const data = source.data.map((row) => ({ ...row }));
      if (this.kind === 'insert')
        data.splice(this.index, 0, Object.fromEntries(source.columns.map(({ key }) => [key, ''])));
      else data.splice(this.index, 1);
      return {
        data,
        columns: source.columns.map((column) => ({ ...column })),
        cellFormats,
        ...workbook,
      };
    }
    const indices: Array<number | null> = source.columns.map((_, index) => index);
    if (this.kind === 'insert') indices.splice(this.index, 0, null);
    else indices.splice(this.index, 1);
    const columns = indices.map((previous, index) => ({
      ...(previous === null ? { width: 100, type: 'string' as const } : source.columns[previous]),
      key: getExcelColumnName(index),
      displayName: getExcelColumnName(index),
    }));
    const data = source.data.map((row) =>
      Object.fromEntries(
        columns.map((column, index) => {
          const previous = indices[index];
          return [column.key, previous === null ? '' : (row[source.columns[previous].key] ?? '')];
        })
      )
    );
    return { data, columns, cellFormats, ...workbook };
  }

  private mapCells<T extends object>(cells: Record<string, T>): Record<string, T> {
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(cells)) {
      const [row, column] = key.split(':').map(Number);
      const mapped = this.mapIndex(this.axis === 'row' ? row : column);
      if (mapped !== null)
        result[this.axis === 'row' ? `${mapped}:${column}` : `${row}:${mapped}`] = { ...value };
    }
    return result;
  }

  private mapRange(range: GridRange): GridRange | null {
    const coordinate = this.axis === 'row' ? 'r' : 'c';
    const start = this.mapIndex(range.s[coordinate]) ?? this.index;
    const end = this.mapIndex(range.e[coordinate]) ?? this.index - 1;
    if (start > end) return null;
    const result = { s: { ...range.s, [coordinate]: start }, e: { ...range.e, [coordinate]: end } };
    return result.s.r === result.e.r && result.s.c === result.e.c ? null : result;
  }
}
