/**
 * Add Phase Action - Handles addNewPhase2Next stream type
 * Adds a new phase after the current one
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class AddPhaseAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const phase = payload?.phase;

    if (phase) {
      await globalUpdateInterface.addNewPhase2Next(phase);
      await showToast({
        message: `已添加新阶段: ${phase.title || '未命名阶段'}`,
        type: 'success',
      });
    }
  }
}

registerStreamAction('addNewPhase2Next', AddPhaseAction);
