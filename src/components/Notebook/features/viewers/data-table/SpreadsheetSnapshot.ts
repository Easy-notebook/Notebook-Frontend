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

export interface GridAddress {
  r: number;
  c: number;
}
export interface GridRange {
  s: GridAddress;
  e: GridAddress;
}

/** Original cell identities and current merge geometry travel with the editable grid. */
export interface SpreadsheetWorkbookState {
  sources: Record<string, GridAddress>;
  merges: GridRange[];
}

// History state for undo/redo
export interface SpreadsheetSnapshot {
  data: CSVRow[];
  columns: ColumnInfo[];
  cellFormats: Record<string, CellFormat>;
  workbook?: SpreadsheetWorkbookState;
}
