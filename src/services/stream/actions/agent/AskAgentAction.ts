import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import { useAIAgentStore } from '@Store/AIAgentStore';

/** Records an incoming agent-help request using the shared QA creation contract. */
export class AskAgentAction extends StreamAction {
  async execute({ payload, showToast }: StreamActionContext): Promise<void> {
    const question = payload.question;
    if (question === undefined || question === '') return;
    if (typeof question !== 'string') throw new Error('Agent help question must be a string');
    const agentType = payload.agentType || 'general';
    if (typeof agentType !== 'string') throw new Error('Agent type must be a string');

    useAIAgentStore.getState().addQA({
      type: 'user',
      content: question,
      agentType,
      resolved: false,
      onProcess: true,
    });
    // Notification delivery is separate from creating the request. A toast failure must
    // not report that QA creation failed after the request has already been admitted.
    await showToast({
      message: `正在请求 ${agentType} Agent 帮助...`,
      type: 'info',
    });
  }
}

registerStreamAction('ask_agent_for_help', AskAgentAction);
