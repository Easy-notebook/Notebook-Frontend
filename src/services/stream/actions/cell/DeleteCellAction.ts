/**
 * Delete Cell Action - Handles delete_cell stream type
 * Deletes a specific cell by ID
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class DeleteCellAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const cellId = payload?.cellId;

    console.log('🗑️ [DeleteCellAction] 删除cell:', { cellId });

    if (!cellId) {
      console.error('❌ [DeleteCellAction] 没有提供cellId');
      return;
    }

    const state = useStore.getState();
    const cell = state.cells.find((c) => c.id === cellId);

    if (cell) {
      console.log('✅ [DeleteCellAction] 找到要删除的cell:', {
        id: cell.id,
        type: cell.type,
        contentLength: cell.content?.length,
      });
      state.deleteCell(cellId);
      await showToast({
        message: '已删除 Cell',
        type: 'success',
      });
      console.log('✅ [DeleteCellAction] Cell删除成功');
    } else {
      console.error('❌ [DeleteCellAction] 找不到要删除的cell:', cellId);
    }
  }
}

registerStreamAction('delete_cell', DeleteCellAction);
