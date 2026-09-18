/**
 * TipTap Update Action - Handles tiptap_update stream type
 * Updates rich text editor content with optional replace mode
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class TiptapUpdateAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const cellId = payload?.cellId;
    const content = payload?.content;
    const replace = payload?.replace ?? false;

    if (cellId && typeof content === 'string') {
      const state = useStore.getState();
      const target = state.cells.find((c) => c.id === cellId);

      if (target) {
        if (replace) {
          state.updateCell(cellId, content);
        } else {
          state.updateCell(cellId, (target.content || '') + content);
        }

        // Set as editing cell if not already
        if (state.editingCellId !== cellId) {
          state.setEditingCellId(cellId);
        }
      }
    }
  }
}

registerStreamAction('tiptap_update', TiptapUpdateAction);
