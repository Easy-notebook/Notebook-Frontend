/**
 * Set Running Phase Action - Handles set_running_phase stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class SetRunningPhaseAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;

    const phaseId = payload.phaseId;
    if (phaseId) {
      await globalUpdateInterface.setCurrentRunningPhaseId(phaseId);
    }
  }
}

registerStreamAction('set_running_phase', SetRunningPhaseAction);
