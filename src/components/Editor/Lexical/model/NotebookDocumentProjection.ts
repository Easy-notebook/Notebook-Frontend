import type { Cell } from '@Store/models';

/** Conversations persist with the notebook, but are not editable document blocks. */
export class NotebookDocumentProjection {
  static content(cells: readonly Cell[]): Cell[] {
    return cells.filter((cell) => cell.type !== 'agent');
  }

  static retainConversations(content: Cell[], stored: readonly Cell[]): Cell[] {
    const result = [...content];
    let previous: string | undefined;
    for (const cell of stored) {
      if (cell.type === 'agent' && !result.some((item) => item.id === cell.id)) {
        const anchor = previous ? result.findIndex((item) => item.id === previous) : -1;
        result.splice(anchor < 0 ? result.length : anchor + 1, 0, cell);
      }
      previous = cell.id;
    }
    return result;
  }
}
