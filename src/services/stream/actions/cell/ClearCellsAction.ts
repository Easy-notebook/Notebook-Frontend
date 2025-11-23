/**
 * Clear Cells Action - Handles clear_cells stream type
 * Clears all cells from the notebook
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class ClearCellsAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { showToast } = context;

    const state = useStore.getState();
    const cellCount = state.cells.length;

    console.log('🧹 [ClearCellsAction] 清空所有cells:', { cellCount });

    state.clearCells();

    await showToast({
      message: `已清空所有 Cells (${cellCount} 个)`,
      type: 'success',
    });

    console.log('✅ [ClearCellsAction] Cells清空成功');
  }
}

registerStreamAction('clear_cells', ClearCellsAction);
