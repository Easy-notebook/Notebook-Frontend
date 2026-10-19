import { getExcelColumnName } from './SpreadsheetCoordinates';
import type { SpreadsheetSnapshot, CellFormat } from './SpreadsheetSnapshot';

/** One coordinate transformation shared by cells, columns and user-applied formats. */
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
    const cellFormats: Record<string, CellFormat> = {};
    for (const [key, format] of Object.entries(source.cellFormats)) {
      const [row, column] = key.split(':').map(Number);
      const mapped = this.mapIndex(this.axis === 'row' ? row : column);
      if (mapped !== null)
        cellFormats[this.axis === 'row' ? `${mapped}:${column}` : `${row}:${mapped}`] = {
          ...format,
        };
    }
    if (this.axis === 'row') {
      const data = source.data.map((row) => ({ ...row }));
      if (this.kind === 'insert')
        data.splice(this.index, 0, Object.fromEntries(source.columns.map(({ key }) => [key, ''])));
      else data.splice(this.index, 1);
      return { data, columns: source.columns.map((column) => ({ ...column })), cellFormats };
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
    return { data, columns, cellFormats };
  }
}
