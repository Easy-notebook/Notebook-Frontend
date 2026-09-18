/**
 * Error Action - Handles error stream type
 * Displays error messages and updates cell metadata with error state
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class ErrorAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const message = payload?.message || payload?.error || 'Unknown error';
    const cellId = payload?.cellId;

    // Show error toast
    await showToast({
      message: `错误: ${message}`,
      type: 'error',
    });

    // Update cell metadata if cellId is provided
    if (cellId) {
      const state = useStore.getState();
      const targetCell = state.cells.find((c) => c.id === cellId);

      if (targetCell) {
        state.updateCellObject(cellId, {
          metadata: {
            ...targetCell.metadata,
            error: message,
            status: 'error',
          },
        });
      }
    }

    // Log error for debugging
    console.error('[StreamError]', message, payload);
  }
}

registerStreamAction('error', ErrorAction);
