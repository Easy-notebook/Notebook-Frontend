/**
 * Add Cell Full Action - Handles add_cell stream type
 * Adds a new cell using a complete cell object
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class AddCellFullAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const cell = payload?.cell;
    const position = payload?.position; // 'start', 'end', or specific index

    console.log('📦 [AddCellFullAction] 添加完整cell对象:', {
      hasCell: !!cell,
      cellId: cell?.id,
      cellType: cell?.type,
      position,
    });

    if (!cell) {
      console.error('❌ [AddCellFullAction] 没有提供cell对象');
      return;
    }

    const state = useStore.getState();

    if (position === 'start') {
      if (typeof state.addCellAtIndex === 'function') {
        state.addCellAtIndex(0, cell);
        console.log('✅ [AddCellFullAction] Cell添加到开头');
      } else {
        console.error('❌ [AddCellFullAction] addCellAtIndex方法不存在');
      }
    } else if (typeof position === 'number') {
      if (typeof state.addCellAtIndex === 'function') {
        state.addCellAtIndex(position, cell);
        console.log('✅ [AddCellFullAction] Cell添加到位置:', position);
      } else {
        console.error('❌ [AddCellFullAction] addCellAtIndex方法不存在');
      }
    } else {
      // Default: add to end
      state.addCell(cell);
      console.log('✅ [AddCellFullAction] Cell添加到末尾');
    }
  }
}

registerStreamAction('add_cell', AddCellFullAction);
