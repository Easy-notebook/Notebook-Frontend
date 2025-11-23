/**
 * Add Content To Description Action - Handles addNewContent2CurrentCellDescription stream type
 * Appends content to the current cell's description field
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class AddContentToDescriptionAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const content = payload?.content;
    const cellId = payload?.cellId;

    console.log('📝 [AddContentToDescriptionAction] 追加内容到description:', {
      cellId,
      contentLength: content?.length,
      contentPreview: content?.substring(0, 50),
    });

    const state = useStore.getState();
    const targetCellId = cellId || state.currentCellId;

    if (!targetCellId) {
      console.error('❌ [AddContentToDescriptionAction] 没有目标cellId');
      return;
    }

    if (typeof content !== 'string') {
      console.error('❌ [AddContentToDescriptionAction] content不是字符串');
      return;
    }

    const targetCell = state.cells.find((c) => c.id === targetCellId);

    if (targetCell) {
      const currentDescription = targetCell.description || '';
      state.updateCellObject(targetCellId, {
        description: currentDescription + content,
      });
      console.log('✅ [AddContentToDescriptionAction] description追加成功:', {
        cellId: targetCellId,
        oldLength: currentDescription.length,
        addedLength: content.length,
        newLength: (currentDescription + content).length,
      });
    } else {
      console.error('❌ [AddContentToDescriptionAction] 找不到目标cell:', targetCellId);
    }
  }
}

registerStreamAction('addNewContent2CurrentCellDescription', AddContentToDescriptionAction);
