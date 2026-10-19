/**
 * Update Current Phase Action - Handles update_current_phase stream type
 * Updates the current workflow phase
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class UpdateCurrentPhaseAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast, notebookId } = context;
    const phaseId = payload?.phaseId;
    if (!phaseId) return;
    if (typeof phaseId !== 'string') throw new Error('Phase identity must be a string');

    const owner = useStore.getState();
    if (notebookId !== undefined && notebookId !== owner.notebookId) return;
    // Store owns the atomic phase selection and step reset. Never reset again after yielding.
    owner.setCurrentPhase(phaseId);
    const current = useStore.getState();
    if (current.notebookId !== owner.notebookId || current.currentPhaseId !== phaseId) return;
    await showToast({ message: '当前阶段已更新', type: 'success' });
  }
}

registerStreamAction('update_current_phase', UpdateCurrentPhaseAction);
