import type { Cell } from '@Store/models';

/** Only a dedicated first H1 cell is the notebook title; a multi-block cell remains body. */
export function isNotebookTitleCell(cell?: Pick<Cell, 'type' | 'content'>): boolean {
  return cell?.type === 'markdown' && /^#(?:[ \t]+[^\r\n]*|[ \t]*)$/.test(cell.content.trim());
}
