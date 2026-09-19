/**
 * Convert Code To Hybrid Action - Handles convertCurrentCodeCellToHybridCell stream type
 * Converts a code cell to a hybrid cell
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import { CellContent } from '@Store/models/CellContent';
import { getCellById } from '@Store/models/cellIndex';

export class ConvertCodeToHybridAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const cellId = payload?.cellId;

    const state = useStore.getState();
    const targetCellId = cellId || state.currentCellId;

    if (targetCellId) {
      const targetCell = getCellById(state.cells, targetCellId);

      if (targetCell && targetCell.type === 'code') {
        const model = new CellContent(targetCell).convertToHybrid();
        state.updateCellObject(targetCellId, { type: model.type, content: model.content });

        await showToast({
          message: '已转换为 Hybrid Cell',
          type: 'success',
        });
      }
    }
  }
}

registerStreamAction('convertCurrentCodeCellToHybridCell', ConvertCodeToHybridAction);
