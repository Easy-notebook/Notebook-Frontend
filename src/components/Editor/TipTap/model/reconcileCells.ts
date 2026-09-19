import type { Cell } from '@Store/models';
import { getCellById } from '@Store/models/cellIndex';

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
  return projected.map((cell) => {
    const previous = getCellById(stored, cell.id);
    if (!previous) return cell;

    // A representation change does not create a new cell. Outputs and business
    // metadata remain store-owned; source-mode lifecycle fields belong to the document.
    if (previous.type !== cell.type) {
      return {
        ...previous,
        ...cell,
        // Hybrid carries mixed Markdown; an outer executable-node default is
        // not authoritative language metadata for that mixed document.
        ...(cell.type === 'hybrid' && previous.metadata?.sourceCellType === 'hybrid'
          ? { language: previous.language }
          : {}),
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
