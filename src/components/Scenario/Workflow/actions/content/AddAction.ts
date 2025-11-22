/**
 * AddAction - Adds text or code content to the notebook
 * Ported from: ref/Notebook-BCC/actions/content/add_action.py
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import useNotebookStore from '@Store/notebookStore';

export class AddAction extends ActionBase {
  /**
   * Handle ADD_ACTION type - adds text or code content to the notebook.
   *
   * For text cells with shot_type='markdown' or None (default to markdown):
   * - If the last cell is a markdown cell and is NOT a heading (doesn't start with #),
   *   append content to the last cell instead of creating a new one
   * - Otherwise, create a new cell as usual
   */
  execute(step: ExecutionStep): string | null {
    const cellType = step.shotType === 'action' ? 'code' : 'text';
    const content = step.content || '';

    console.log(`[AddAction] shotType: ${step.shotType}, cellType: ${cellType}`);
    // remove the \n of the content
    content.replace(/\n/g, ' ');

    // Special logic for text cells (matches backend logic)
    // Backend checks: cell_type == 'text' and (shot_type == 'markdown' or shot_type is None)
    // Frontend equivalent: cellType === 'text' (which covers all non-'action' shotTypes)
    if (cellType === 'text') {
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
          const newContent = lastCell.content + '\n\n' + content;
          notebookStore.updateCell(lastCell.id, newContent);
          console.log(`[AddAction] ✅ Appended to existing cell: ${lastCell.id}`);
          return lastCell.id;
        } else {
          console.log(`[AddAction] Last cell is a heading, creating new cell`);
        }
      } else {
        console.log(`[AddAction] No suitable last cell for appending, creating new cell`);
      }
    }

    // Default behavior: create new cell
    const cellId = this.scriptStore.addCell(cellType, content, step.metadata);
    console.log(`[AddAction] Created new ${cellType} cell: ${cellId}`);
    return cellId;
  }
}

/**
 * Alias for 'add-text' action type
 */
export class AddTextAction extends AddAction {
  execute(step: ExecutionStep): string | null {
    // Force text type
    const modifiedStep = { ...step, shotType: 'markdown' };
    return super.execute(modifiedStep);
  }
}

// Register actions
registerAction('add', AddAction);
registerAction('add-text', AddTextAction);
