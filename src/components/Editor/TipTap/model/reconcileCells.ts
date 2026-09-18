import type { Cell } from '@Store/models';

/**
 * Tiptap owns structure and Markdown text. The store owns executable content,
 * outputs, and metadata that is not represented by a document node.
 */
export function reconcileCells(projected: Cell[], stored: Cell[]): Cell[] {
  const byId = new Map(stored.map((cell) => [cell.id, cell]));

  return projected.map((cell) => {
    const previous = byId.get(cell.id);
    if (!previous) return cell;

    // A representation change does not create a new cell. Outputs and business
    // metadata remain store-owned; only the document's editorMode is authoritative.
    if (previous.type !== cell.type) {
      return {
        ...previous,
        ...cell,
        outputs: previous.outputs ?? cell.outputs,
        enableEdit: previous.enableEdit ?? cell.enableEdit,
        metadata: {
          ...cell.metadata,
          ...previous.metadata,
          editorMode: cell.metadata?.editorMode,
        },
      };
    }

    if (cell.type === 'code' || cell.type === 'hybrid' || cell.type === 'thinking') {
      return previous;
    }

    if (cell.type === 'markdown' && cell.metadata?.editorMode !== previous.metadata?.editorMode) {
      return {
        ...previous,
        content: cell.content,
        metadata: { ...previous.metadata, editorMode: cell.metadata?.editorMode },
      };
    }
    if (cell.content === previous.content) return previous;
    return { ...previous, content: cell.content };
  });
}

export function cellsChanged(next: Cell[], current: Cell[]): boolean {
  return next.length !== current.length || next.some((cell, index) => cell !== current[index]);
}
