import { v4 as uuidv4 } from 'uuid';
import type {
  EasyNotebookCell,
  EasyNotebookCellPatch,
  EasyNotebookCellType,
  EasyNotebookDocument,
  EasyNotebookEditorAction,
  EasyNotebookOutput,
} from './types';

const normalizeCell = (cell: EasyNotebookCell): EasyNotebookCell => ({
  ...cell,
  content: typeof cell.content === 'string' ? cell.content : String(cell.content ?? ''),
  outputs: Array.isArray(cell.outputs) ? [...cell.outputs] : [],
  enableEdit: cell.enableEdit ?? true,
  phaseId: cell.phaseId ?? null,
  description: cell.description ?? null,
  metadata: cell.metadata ? { ...cell.metadata } : cell.metadata,
});

export const createNotebookCell = (
  type: EasyNotebookCellType = 'markdown',
  init: Partial<EasyNotebookCell> = {}
): EasyNotebookCell =>
  normalizeCell({
    id: init.id ?? uuidv4(),
    type,
    content: init.content ?? '',
    outputs: init.outputs ?? [],
    enableEdit: init.enableEdit ?? true,
    phaseId: init.phaseId ?? null,
    description: init.description ?? null,
    metadata: init.metadata ?? null,
  });

export class EasyNotebookDocumentModel {
  private readonly value: EasyNotebookDocument;

  constructor(document: EasyNotebookDocument) {
    this.value = {
      id: document.id ?? null,
      title: document.title ?? 'Untitled Notebook',
      metadata: document.metadata ? { ...document.metadata } : {},
      cells: Array.isArray(document.cells) ? document.cells.map(normalizeCell) : [],
    };
  }

  static empty(init: Partial<EasyNotebookDocument> = {}): EasyNotebookDocumentModel {
    return new EasyNotebookDocumentModel({
      id: init.id ?? null,
      title: init.title ?? 'Untitled Notebook',
      metadata: init.metadata ?? {},
      cells: init.cells ?? [],
    });
  }

  static from(document: EasyNotebookDocument): EasyNotebookDocumentModel {
    return new EasyNotebookDocumentModel(document);
  }

  get id(): string | null | undefined {
    return this.value.id;
  }

  get title(): string {
    return this.value.title ?? 'Untitled Notebook';
  }

  get cells(): EasyNotebookCell[] {
    return this.value.cells.map(normalizeCell);
  }

  get cellCount(): number {
    return this.value.cells.length;
  }

  cellById(cellId: string): EasyNotebookCell | null {
    return this.value.cells.find((cell) => cell.id === cellId) ?? null;
  }

  cellAt(index: number): EasyNotebookCell | null {
    return this.value.cells[index] ?? null;
  }

  insertCell(
    cell: EasyNotebookCell | EasyNotebookCellType = 'markdown',
    index = this.value.cells.length
  ): EasyNotebookDocumentModel {
    const nextCell = typeof cell === 'string' ? createNotebookCell(cell) : normalizeCell(cell);
    const nextCells = [...this.value.cells];
    const safeIndex = Math.max(0, Math.min(index, nextCells.length));
    nextCells.splice(safeIndex, 0, nextCell);
    return this.replaceCells(nextCells);
  }

  updateCell(cellId: string, patch: EasyNotebookCellPatch): EasyNotebookDocumentModel {
    return this.replaceCells(
      this.value.cells.map((cell) =>
        cell.id === cellId ? normalizeCell({ ...cell, ...patch, id: cell.id }) : cell
      )
    );
  }

  deleteCell(cellId: string): EasyNotebookDocumentModel {
    return this.replaceCells(this.value.cells.filter((cell) => cell.id !== cellId));
  }

  moveCell(fromIndex: number, toIndex: number): EasyNotebookDocumentModel {
    const nextCells = [...this.value.cells];
    if (fromIndex < 0 || fromIndex >= nextCells.length) return this;

    const safeTarget = Math.max(0, Math.min(toIndex, nextCells.length - 1));
    const [cell] = nextCells.splice(fromIndex, 1);
    nextCells.splice(safeTarget, 0, cell);
    return this.replaceCells(nextCells);
  }

  setOutputs(cellId: string, outputs: EasyNotebookOutput[]): EasyNotebookDocumentModel {
    return this.updateCell(cellId, { outputs: Array.isArray(outputs) ? [...outputs] : [] });
  }

  reduce(action: EasyNotebookEditorAction): EasyNotebookDocumentModel {
    switch (action.type) {
      case 'insert_cell':
        return this.insertCell(action.cell ?? createNotebookCell(), action.index);
      case 'update_cell':
        return action.cellId && action.patch ? this.updateCell(action.cellId, action.patch) : this;
      case 'delete_cell':
        return action.cellId ? this.deleteCell(action.cellId) : this;
      case 'move_cell':
        return typeof action.fromIndex === 'number' && typeof action.toIndex === 'number'
          ? this.moveCell(action.fromIndex, action.toIndex)
          : this;
      case 'set_outputs':
        return action.cellId ? this.setOutputs(action.cellId, action.outputs ?? []) : this;
      case 'replace_document':
        return action.document ? EasyNotebookDocumentModel.from(action.document) : this;
      default:
        return this;
    }
  }

  toJSON(): EasyNotebookDocument {
    return {
      ...this.value,
      metadata: this.value.metadata ? { ...this.value.metadata } : {},
      cells: this.value.cells.map(normalizeCell),
    };
  }

  private replaceCells(cells: EasyNotebookCell[]): EasyNotebookDocumentModel {
    return new EasyNotebookDocumentModel({
      ...this.value,
      cells,
    });
  }
}

export const reduceEasyNotebookDocument = (
  document: EasyNotebookDocument,
  action: EasyNotebookEditorAction
): EasyNotebookDocument => EasyNotebookDocumentModel.from(document).reduce(action).toJSON();
