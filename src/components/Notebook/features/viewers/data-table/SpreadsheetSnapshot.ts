export interface CSVRow {
  [key: string]: string | number | boolean | null | undefined;
}

export interface ColumnInfo {
  key: string;
  displayName: string;
  width: number;
  type: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
}

// Cell formatting style
export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
}

// History state for undo/redo
export interface SpreadsheetSnapshot {
  data: CSVRow[];
  columns: ColumnInfo[];
  cellFormats: Record<string, CellFormat>;
}
