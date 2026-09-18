/**
 * Convert Code To Hybrid Action - Handles convertCurrentCodeCellToHybridCell stream type
 * Converts a code cell to a hybrid cell
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class ConvertCodeToHybridAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const cellId = payload?.cellId;

    const state = useStore.getState();
    const targetCellId = cellId || state.currentCellId;

    if (targetCellId) {
      const targetCell = state.cells.find((c) => c.id === targetCellId);

      if (targetCell && targetCell.type === 'code') {
        state.updateCellObject(targetCellId, {
          type: 'hybrid',
        });

        await showToast({
          message: '已转换为 Hybrid Cell',
          type: 'success',
        });
      }
    }
  }
}

registerStreamAction('convertCurrentCodeCellToHybridCell', ConvertCodeToHybridAction);
