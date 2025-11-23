/**
 * Remember Information Action - Handles remember_information stream type
 * Stores information to agent memory
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class RememberInformationAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const information = payload?.information;
    const category = payload?.category || 'general';

    if (information) {
      console.log(`[RememberInformation] Storing to ${category}:`, information);

      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const state = useAIAgentStore.getState();

        // Store to agent memory
        state.addMemory({
          content: information,
          category: category,
          timestamp: Date.now(),
        });

        await showToast({
          message: '信息已记忆',
          type: 'success',
        });
      } catch (error) {
        console.error('Failed to store information to memory:', error);
      }
    }
  }
}

registerStreamAction('remember_information', RememberInformationAction);
