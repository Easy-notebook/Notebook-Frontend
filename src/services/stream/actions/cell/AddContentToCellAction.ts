/**
 * Add Content To Cell Action - Handles addNewContent2CurrentCell stream type
 * Appends content to the current cell
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class AddContentToCellAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const content = payload?.content;
    const cellId = payload?.cellId;

    console.log('➕ [AddContentToCellAction] 追加内容到cell:', {
      cellId,
      contentLength: content?.length,
      contentPreview: content?.substring(0, 50),
    });

    const state = useStore.getState();
    const targetCellId = cellId || state.currentCellId;

    if (!targetCellId) {
      console.error('❌ [AddContentToCellAction] 没有目标cellId');
      return;
    }

    if (typeof content !== 'string') {
      console.error('❌ [AddContentToCellAction] content不是字符串');
      return;
    }

    const targetCell = state.cells.find((c) => c.id === targetCellId);

    if (targetCell) {
      const currentContent = targetCell.content || '';
      state.updateCell(targetCellId, currentContent + content);
      console.log('✅ [AddContentToCellAction] 内容追加成功:', {
        cellId: targetCellId,
        oldLength: currentContent.length,
        addedLength: content.length,
        newLength: (currentContent + content).length,
      });
    } else {
      console.error('❌ [AddContentToCellAction] 找不到目标cell:', targetCellId);
    }
  }
}

registerStreamAction('addNewContent2CurrentCell', AddContentToCellAction);
