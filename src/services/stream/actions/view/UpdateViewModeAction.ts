/**
 * Update View Mode Action - Handles update_view_mode stream type
 * Switches between create/step/demo view modes
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class UpdateViewModeAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const mode = payload?.mode;

    if (mode) {
      await globalUpdateInterface.setViewMode(mode);
      await showToast({
        message: `切换到 ${mode === 'create' ? 'Create' : 'Step'} Mode 成功`,
        type: 'success',
      });
    }
  }
}

registerStreamAction('update_view_mode', UpdateViewModeAction);
