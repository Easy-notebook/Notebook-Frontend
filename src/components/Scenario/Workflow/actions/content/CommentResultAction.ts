/**
 * CommentResultAction - Adds content and moves effects to history
 * Ported from: ref/Notebook-BCC/actions/content/comment_result_action.py
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import useNotebookStore from '@Store/notebookStore';

export class CommentResultAction extends ActionBase {
  execute(step: ExecutionStep): string | null {
    const cellType = 'text';
    const content = step.content || '';

    console.log(`[AddAction] shotType: ${step.shotType}, cellType: ${cellType}`);
    // remove the \n of the content
    content.replace(/\n/g, ' ');

    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;
    const lastCell = cells.length > 0 ? cells[cells.length - 1] : null;

    console.log(
      `[AddAction] Last cell:`,
      lastCell
        ? {
            id: lastCell.id,
            type: lastCell.type,
            contentPreview: lastCell.content?.substring(0, 50),
            startsWithHash: lastCell.content?.trim().startsWith('#'),
          }
        : 'none'
    );

    // Append to last cell if it's a non-heading markdown cell
    if (lastCell && lastCell.type === 'markdown' && lastCell.content) {
      const trimmedContent = lastCell.content.trim();
      if (!trimmedContent.startsWith('#')) {
        const newContent = lastCell.content + content;
        notebookStore.updateCell(lastCell.id, newContent);
        console.log(`[AddAction] ✅ Appended to existing cell: ${lastCell.id}`);
        return lastCell.id;
      } else {
        console.log(`[AddAction] Last cell is a heading, creating new cell`);
      }
    } else {
      console.log(`[AddAction] No suitable last cell for appending, creating new cell`);
    }

    // Default behavior: create new cell
    const cellId = this.scriptStore.addCell(cellType, content, step.metadata);
    console.log(`[AddAction] Created new ${cellType} cell: ${cellId}`);
    return cellId;
  }
}

registerAction('comment-result', CommentResultAction);
