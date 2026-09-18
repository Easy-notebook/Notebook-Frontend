/**
 * Update Current Phase Action - Handles update_current_phase stream type
 * Updates the current workflow phase
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class UpdateCurrentPhaseAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const phaseId = payload?.phaseId;

    if (phaseId) {
      await globalUpdateInterface.setCurrentPhase(phaseId);
      await globalUpdateInterface.setCurrentStepIndex(0);
      await showToast({ message: '当前阶段已更新', type: 'success' });
    }
  }
}

registerStreamAction('update_current_phase', UpdateCurrentPhaseAction);
