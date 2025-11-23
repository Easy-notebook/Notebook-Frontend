/**
 * Set Running Phase Action - Handles set_running_phase stream type
 * Sets the currently running phase
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class SetRunningPhaseAction extends StreamAction {
  execute(context: StreamActionContext): void {
    const { payload } = context;
    const phaseId = payload?.phaseId;

    if (phaseId) {
      globalUpdateInterface.setRunningPhase(phaseId);
    }
  }
}

registerStreamAction('set_running_phase', SetRunningPhaseAction);
