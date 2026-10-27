import { CapturedQAEvent } from '../../CapturedQAEvent';
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

      new CapturedQAEvent(
        { type: 'agent-communication', content: message, agent: sourceAgent, targetAgent },
        payload.QId
      ).record();
    }
  }
}

registerStreamAction('communicate_with_agent', CommunicateAgentAction);
