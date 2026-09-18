import type { Cell } from '@Store/models';

/**
 * Tiptap owns structure and Markdown text. The store owns executable content,
 * outputs, and metadata that is not represented by a document node.
 */
export function reconcileCells(projected: Cell[], stored: Cell[]): Cell[] {
  const byId = new Map(stored.map((cell) => [cell.id, cell]));

  return projected.map((cell) => {
    const previous = byId.get(cell.id);
    if (!previous || previous.type !== cell.type) return cell;

    if (cell.type === 'code' || cell.type === 'hybrid' || cell.type === 'thinking') {
      return previous;
    }

    if (cell.content === previous.content) return previous;
    return { ...previous, content: cell.content };
  });
}

export function cellsChanged(next: Cell[], current: Cell[]): boolean {
  return next.length !== current.length || next.some((cell, index) => cell !== current[index]);
}
