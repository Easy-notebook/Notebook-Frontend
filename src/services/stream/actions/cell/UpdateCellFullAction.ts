/**
 * Update Cell Full Action - Handles update_cell stream type
 * Updates a cell using a complete cell object
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class UpdateCellFullAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const cell = payload?.cell;

    console.log('📦 [UpdateCellFullAction] 更新完整cell对象:', {
      hasCell: !!cell,
      cellId: cell?.id,
      cellType: cell?.type,
    });

    if (!cell) {
      console.error('❌ [UpdateCellFullAction] 没有提供cell对象');
      return;
    }

    if (!cell.id) {
      console.error('❌ [UpdateCellFullAction] cell对象缺少id');
      return;
    }

    const state = useStore.getState();
    const existingCell = state.cells.find((c) => c.id === cell.id);

    if (existingCell) {
      // Merge the updates into the existing cell
      state.updateCellObject(cell.id, cell);
      console.log('✅ [UpdateCellFullAction] Cell更新成功:', {
        cellId: cell.id,
        updates: Object.keys(cell),
      });
    } else {
      console.error('❌ [UpdateCellFullAction] 找不到要更新的cell:', cell.id);
    }
  }
}

registerStreamAction('update_cell', UpdateCellFullAction);
