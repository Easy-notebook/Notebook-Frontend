/**
 * Set Cell Mode Action - Handles setCurrentCellMode_* stream types
 * Controls cell display mode (complete/onlyCode/onlyOutput)
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

type CellDisplayMode = 'complete' | 'onlyCode' | 'onlyOutput';

export class SetCellModeAction extends StreamAction {
  private mode: CellDisplayMode;

  constructor(mode: CellDisplayMode) {
    super();
    this.mode = mode;
  }

  execute(context: StreamActionContext): void {
    const { payload } = context;
    const cellId = payload?.cellId;

    const state = useStore.getState();
    const targetCellId = cellId || state.currentCellId;

    if (targetCellId) {
      // Update cell metadata to set display mode
      state.updateCellMetadata(targetCellId, {
        displayMode: this.mode,
      });
    }
  }
}

// Register all three mode variants
registerStreamAction(
  'setCurrentCellMode_complete',
  class extends SetCellModeAction {
    constructor() {
      super('complete');
    }
  }
);

registerStreamAction(
  'setCurrentCellMode_onlyCode',
  class extends SetCellModeAction {
    constructor() {
      super('onlyCode');
    }
  }
);

registerStreamAction(
  'setCurrentCellMode_onlyOutput',
  class extends SetCellModeAction {
    constructor() {
      super('onlyOutput');
    }
  }
);
