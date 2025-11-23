/**
 * Clear Outputs Action - Handles clear_outputs stream type
 * Clears all cell outputs in the notebook
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class ClearOutputsAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { showToast } = context;

    const state = useStore.getState();

    console.log('🧹 [ClearOutputsAction] 清空所有cell outputs');

    // Clear outputs for all cells
    let clearedCount = 0;
    state.cells.forEach((cell) => {
      if (cell.outputs && cell.outputs.length > 0) {
        state.updateCellObject(cell.id, { outputs: [] });
        clearedCount++;
      }
    });

    console.log('✅ [ClearOutputsAction] 清空完成:', {
      totalCells: state.cells.length,
      clearedCount,
    });

    await showToast({
      message: `已清空所有输出 (${clearedCount} 个cells)`,
      type: 'success',
    });
  }
}

registerStreamAction('clear_outputs', ClearOutputsAction);
