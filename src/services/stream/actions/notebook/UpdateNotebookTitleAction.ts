/**
 * Update Notebook Title Action - Handles update_notebook_title stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class UpdateNotebookTitleAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const title = payload.title;

    if (title) {
      // Update the first cell if it's a title cell
      const cells = useStore.getState().cells;
      if (cells.length > 0 && cells[0].type === 'markdown') {
        const firstCell = cells[0];
        const newContent = `# ${title}`;

        // Only update if content is different
        if (firstCell.content !== newContent) {
          useStore.getState().updateCell(firstCell.id, newContent);
          console.log('✅ [UpdateNotebookTitle] Updated notebook title:', title);
        }
      }
    }
  }
}

registerStreamAction('update_notebook_title', UpdateNotebookTitleAction);
