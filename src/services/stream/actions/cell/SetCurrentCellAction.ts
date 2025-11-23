/**
 * Set Current Cell Action - Handles set_current_cell stream type
 * Sets the currently selected/active cell
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class SetCurrentCellAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const cellId = payload?.cellId;

    console.log('👉 [SetCurrentCellAction] 设置当前cell:', { cellId });

    if (!cellId) {
      console.error('❌ [SetCurrentCellAction] 没有提供cellId');
      return;
    }

    const state = useStore.getState();
    const cell = state.cells.find((c) => c.id === cellId);

    if (cell) {
      state.setCurrentCellId(cellId);
      console.log('✅ [SetCurrentCellAction] 当前cell已设置:', {
        cellId,
        type: cell.type,
      });
    } else {
      console.error('❌ [SetCurrentCellAction] 找不到指定的cell:', cellId);
    }
  }
}

registerStreamAction('set_current_cell', SetCurrentCellAction);
