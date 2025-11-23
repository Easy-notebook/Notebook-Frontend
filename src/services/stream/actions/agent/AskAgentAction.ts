/**
 * Ask Agent Action - Handles ask_agent_for_help stream type
 * Requests help from an AI agent
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class AskAgentAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const question = payload?.question;
    const agentType = payload?.agentType || 'general';

    if (question) {
      console.log(`[AskAgent] Requesting help from ${agentType} agent:`, question);

      // Import AI agent store dynamically
      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const state = useAIAgentStore.getState();

        // Create a new QA entry
        state.addNewQA({
          question: question,
          agentType: agentType,
          onProcess: true,
        });

        await showToast({
          message: `正在请求 ${agentType} Agent 帮助...`,
          type: 'info',
        });
      } catch (error) {
        console.error('Failed to request agent help:', error);
        await showToast({
          message: '请求 Agent 帮助失败',
          type: 'error',
        });
      }
    }
  }
}

registerStreamAction('ask_agent_for_help', AskAgentAction);
