/**
 * Notebook Cell (simplified from notebookStore Cell type)
 */
export interface NotebookCell {
  id: string;
  type: 'code' | 'markdown';
  content: string;
  outputs?: any[];
  enable_edit?: boolean;
  description?: string;
  metadata?: any;
  language?: string;
  could_visible_in_writing_mode?: boolean;
  execution_count?: number | null;
  isUpdate?: boolean;
}

/**
 * Notebook state
 */
export interface NotebookState {
  notebook_id: string | null;
  title: string | null;
  cell_count: number;
  last_cell_type: string | null;
  last_output: any;
  cells?: NotebookCell[];
  execution_count?: number;
}

export class Notebook {
  private _data: NotebookState;

  constructor(data: NotebookState) {
    this._data = data;
  }

  public get id(): string | null {
    return this._data.notebook_id;
  }

  public get title(): string | null {
    return this._data.title;
  }

  public get cellCount(): number {
    return this._data.cell_count;
  }

  public get lastCellType(): string | null {
    return this._data.last_cell_type;
  }

  public get lastOutput(): any {
    return this._data.last_output;
  }

  public get cells(): NotebookCell[] {
    return this._data.cells || [];
  }

  public get executionCount(): number | undefined {
    return this._data.execution_count;
  }

  public setNotebookId(id: string | null): void {
    this._data.notebook_id = id;
  }

  public setTitle(title: string | null): void {
    this._data.title = title;
  }

  public setCells(cells: NotebookCell[]): void {
    this._data.cells = cells;
    this._data.cell_count = cells.length;
  }

  public addCell(cell: NotebookCell): void {
    if (!this._data.cells) {
      this._data.cells = [];
    }
    this._data.cells.push(cell);
    this._data.cell_count = this._data.cells.length;
  }

  public updateCell(cellId: string, updates: Partial<NotebookCell>): void {
    if (!this._data.cells) return;
    const index = this._data.cells.findIndex((c) => c.id === cellId);
    if (index !== -1) {
      this._data.cells[index] = { ...this._data.cells[index], ...updates };
    }
  }

  public setLastOutput(output: any): void {
    this._data.last_output = output;
  }

  public setLastCellType(type: string | null): void {
    this._data.last_cell_type = type;
  }

  public setExecutionCount(count: number): void {
    this._data.execution_count = count;
  }

  public update(data: Partial<NotebookState>): void {
    this._data = { ...this._data, ...data };
  }

  public toJSON(): NotebookState {
    return JSON.parse(JSON.stringify(this._data));
  }
}
