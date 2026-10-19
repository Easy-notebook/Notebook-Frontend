/**
 * Init Streaming Answer Action - Handles initStreamingAnswer stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import { qaStreamManager } from '../../managers/QAStreamManager';
import { AgentMemoryService } from '@Services/agentMemoryService';
import { agentLog } from '@Utils/logger';
import { QAViewPresenter } from './QAViewPresenter';

export class InitStreamingAnswerAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    context.signal?.throwIfAborted();
    const { payload, data } = context;
    const notebookId = context.notebookId ?? useStore.getState().notebookId;

    agentLog.info('Initializing streaming response', { data });
    const qid = payload.QId;

    if (qid !== undefined && qid !== null) {
      const qidStr = Array.isArray(qid) ? qid[0] : qid.toString();
      await globalUpdateInterface.initStreamingAnswer(qidStr);
      context.signal?.throwIfAborted();

      // Record current streaming QA
      qaStreamManager.setStreamingQaId(qidStr, context.signal);

      await QAViewPresenter.show(context.signal);
      context.signal?.throwIfAborted();

      // Record QA interaction start
      try {
        if (notebookId) {
          agentLog.info('Recording QA interaction start', { qid: qidStr });

          AgentMemoryService.updateCurrentContext(notebookId, 'general', {
            current_qa_id: qidStr,
            interaction_start_time: new Date().toISOString(),
            interaction_status: 'in_progress',
          });
        }
      } catch (error) {
        context.signal?.throwIfAborted();
        console.error('记录QA开始时出错:', error);
      }
    } else {
      console.error('Missing QId in stream data:', data);
    }
  }
}

registerStreamAction('initStreamingAnswer', InitStreamingAnswerAction);
