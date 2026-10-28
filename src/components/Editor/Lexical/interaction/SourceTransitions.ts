import type { Cell } from '@Store/models';
import {
  formatCodeFence,
  standaloneFence,
  firstExecutableFence,
} from '@Utils/markdown/fencedMarkdown';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';

export function breakCellFence(cell: Cell): Cell {
  const content =
    cell.type === 'hybrid'
      ? cell.content
      : formatCodeFence(cell.content, normalizeCodeLanguage(cell.language));
  const fence = cell.type === 'hybrid' ? firstExecutableFence(content) : standaloneFence(content);
  const edge = fence ? fence.start + fence.indent.length + fence.length : 0;
  return {
    ...cell,
    type: 'markdown',
    content: edge ? content.slice(0, edge - 1) + content.slice(edge) : content,
    metadata: {
      ...cell.metadata,
      editorMode: 'source',
      sourceCellType: cell.type === 'hybrid' ? 'hybrid' : 'code',
    },
  };
}
export function previewCellSource(cell: Cell): Cell {
  const fence = standaloneFence(cell.content);
  const metadata = { ...cell.metadata, editorMode: undefined, sourceCellType: undefined };
  if (cell.metadata?.sourceCellType === 'hybrid') return { ...cell, type: 'hybrid', metadata };
  if (fence)
    return {
      ...cell,
      type: 'code',
      content: fence.code,
      language: normalizeCodeLanguage(fence.language),
      metadata,
    };
  return { ...cell, type: 'markdown', metadata };
}
