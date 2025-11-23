/**
 * Communicate Agent Action - Handles communicate_with_agent stream type
 * Facilitates agent-to-agent communication
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class CommunicateAgentAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;
    const sourceAgent = payload?.sourceAgent;
    const targetAgent = payload?.targetAgent;
    const message = payload?.message;

    if (sourceAgent && targetAgent && message) {
      console.log(`[AgentCommunication] ${sourceAgent} → ${targetAgent}:`, message);

      // Record communication to agent memory
      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const state = useAIAgentStore.getState();
        const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];

        if (runningQA) {
          state.addToolCallToQA(runningQA.id, {
            type: 'agent-communication',
            content: message,
            agent: sourceAgent,
            targetAgent: targetAgent,
          });
        }
      } catch (error) {
        console.error('Failed to record agent communication:', error);
      }
    }
  }
}

registerStreamAction('communicate_with_agent', CommunicateAgentAction);
