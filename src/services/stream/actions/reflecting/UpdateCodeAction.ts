/**
 * UpdateCodeAction - Updates code cell with fixed version
 * Stream Action Type: update_code
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useNotebookStore from '@Store/notebookStore';

export class UpdateCodeAction extends StreamAction {
  static actionType = 'update_code';

  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;
    const p = payload as any;
    const newCode = p.content || p.code || '';

    if (!newCode) {
      console.warn('[UpdateCodeAction] No code content provided');
      return;
    }

    console.log('[UpdateCodeAction] Updating code');

    const notebookStore = useNotebookStore.getState();
    const cells = notebookStore.cells;
    let targetCell = null;

    if (p.cellId || p.codecell_id) {
      const id = p.cellId || p.codecell_id;
      targetCell = cells.find((c) => c.id === id);
    } else {
      // Find last code cell
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i].type === 'code') {
          targetCell = cells[i];
          break;
        }
      }
    }

    if (targetCell) {
      const existingDebug = targetCell.metadata?.debug || {};

      // Update content and metadata
      notebookStore.updateCellObject(targetCell.id, {
        content: newCode,
        metadata: {
          ...targetCell.metadata,
          debug: {
            ...existingDebug,
            isDebugging: true,
            fixedVersion: newCode,
            errorVersion: existingDebug.errorVersion || targetCell.content,
          },
        },
      });

      // Focus the cell
      notebookStore.setCurrentCell(targetCell.id);

      console.log(`[UpdateCodeAction] Updated cell ${targetCell.id}`);
    } else {
      console.warn('[UpdateCodeAction] No target cell found');
    }
  }
}

registerStreamAction(UpdateCodeAction.actionType, UpdateCodeAction);
