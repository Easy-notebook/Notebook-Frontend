/**
 * Set Error Action - Handles set_error stream type
 * Sets global error state and records to agent memory
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class SetErrorAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const error = payload?.error;
    const details = payload?.details;

    if (error) {
      // Set global error state
      const state = useStore.getState();
      state.setError(error);

      // Show error toast
      await showToast({
        message: error,
        type: 'error',
      });

      // Record to agent memory
      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const agentState = useAIAgentStore.getState();
        const runningQA = agentState.qaList.find((q: any) => q.onProcess) || agentState.qaList[0];

        if (runningQA) {
          agentState.addToolCallToQA(runningQA.id, {
            type: 'error',
            content: error,
            details: details,
            agent: 'system',
          });
        }
      } catch (err) {
        console.error('Failed to record error to agent memory:', err);
      }

      console.error('[SetError]', error, details);
    }
  }
}

registerStreamAction('set_error', SetErrorAction);
