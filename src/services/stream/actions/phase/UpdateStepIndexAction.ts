/**
 * Update Step Index Action - Handles update_current_step_index stream type
 * Updates the current step index within a phase
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class UpdateStepIndexAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const stepIndex = payload?.stepIndex;

    if (typeof stepIndex !== 'number' || !Number.isSafeInteger(stepIndex) || stepIndex < 0)
      throw new Error('Step index must be a nonnegative safe integer');
    globalUpdateInterface.setCurrentStepIndex(stepIndex);
  }
}

registerStreamAction('update_current_step_index', UpdateStepIndexAction);
