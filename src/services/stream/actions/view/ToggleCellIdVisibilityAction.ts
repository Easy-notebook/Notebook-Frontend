import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class ToggleCellIdVisibilityAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const store = useStore.getState();
    const current = store.showCellIds;
    const next = !current;

    store.setShowCellIds(next);

    const { showToast } = context;
    if (showToast) {
      await showToast({
        message: `Cell IDs are now ${next ? 'visible' : 'hidden'}`,
        type: 'success',
      });
    }
  }
}

registerStreamAction('toggle_cell_ids', ToggleCellIdVisibilityAction);
