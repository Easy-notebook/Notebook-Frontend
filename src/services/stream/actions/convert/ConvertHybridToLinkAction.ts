/**
 * Convert Hybrid To Link Action - Handles convertCurrentHybridCellToLinkCell stream type
 * Converts a hybrid cell to a link cell
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class ConvertHybridToLinkAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const cellId = payload?.cellId;
    const url = payload?.url;

    const state = useStore.getState();
    const targetCellId = cellId || state.currentCellId;

    if (targetCellId) {
      const targetCell = state.cells.find((c) => c.id === targetCellId);

      if (targetCell && targetCell.type === 'hybrid') {
        state.updateCellObject(targetCellId, {
          type: 'link',
          metadata: {
            ...targetCell.metadata,
            url: url || targetCell.metadata?.url,
          },
        });

        await showToast({
          message: '已转换为 Link Cell',
          type: 'success',
        });
      }
    }
  }
}

registerStreamAction('convertCurrentHybridCellToLinkCell', ConvertHybridToLinkAction);
