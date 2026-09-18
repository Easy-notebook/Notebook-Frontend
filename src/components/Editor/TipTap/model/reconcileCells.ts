import type { Cell } from '@Store/models';

function reconcileMetadata(projected: Cell, stored: Cell) {
  return {
    ...projected.metadata,
    ...stored.metadata,
    editorMode: projected.metadata?.editorMode,
    sourceCellType:
      projected.metadata?.editorMode === 'source' ? projected.metadata?.sourceCellType : undefined,
  };
}

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
    // metadata remain store-owned; source-mode lifecycle fields belong to the document.
    if (previous.type !== cell.type) {
      return {
        ...previous,
        ...cell,
        outputs: previous.outputs ?? cell.outputs,
        enableEdit: previous.enableEdit ?? cell.enableEdit,
        metadata: reconcileMetadata(cell, previous),
      };
    }

    if (cell.type === 'code' || cell.type === 'hybrid' || cell.type === 'thinking') {
      return previous;
    }

    if (
      cell.type === 'markdown' &&
      (cell.metadata?.editorMode !== previous.metadata?.editorMode ||
        cell.metadata?.sourceCellType !== previous.metadata?.sourceCellType)
    ) {
      return {
        ...previous,
        content: cell.content,
        metadata: reconcileMetadata(cell, previous),
      };
    }
    if (cell.content === previous.content) return previous;
    return { ...previous, content: cell.content };
  });
}

export function cellsChanged(next: Cell[], current: Cell[]): boolean {
  return next.length !== current.length || next.some((cell, index) => cell !== current[index]);
}
