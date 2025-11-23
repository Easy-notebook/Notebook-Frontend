/**
 * Update Current Step Index Action - Handles update_current_step_index stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class UpdateCurrentStepIndexAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;

    const index = payload.index;
    if (typeof index === 'number') {
      await globalUpdateInterface.setCurrentStepIndex(index);
      await showToast({ message: '当前步骤已更新', type: 'success' });
    }
  }
}

registerStreamAction('update_current_step_index', UpdateCurrentStepIndexAction);
