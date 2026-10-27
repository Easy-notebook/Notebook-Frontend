import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import { AgentMemoryService } from '@Services/agentMemoryService';
import useStore from '@Store/notebookStore';

export class RememberInformationAction extends StreamAction {
  async execute({ payload, notebookId, showToast }: StreamActionContext): Promise<void> {
    const information = payload.information;
    if (information === undefined || information === '') return;
    if (typeof information !== 'string') throw new Error('Remembered information must be a string');
    const category = payload.category ?? 'general';
    if (typeof category !== 'string') throw new Error('Memory category must be a string');
    const agentType = payload.agentType ?? 'general';
    if (
      agentType !== 'general' &&
      agentType !== 'command' &&
      agentType !== 'debug' &&
      agentType !== 'output'
    )
      throw new Error('Unsupported memory agent type');
    const owner = notebookId ?? useStore.getState().notebookId;
    if (!owner) throw new Error('A notebook is required to remember information');
    AgentMemoryService.rememberInformation(owner, agentType, information, category);
    await showToast({ message: '信息已记忆', type: 'success' });
  }
}

registerStreamAction('remember_information', RememberInformationAction);
