/**
 * Finish Streaming Answer Action - Handles finishStreamingAnswer stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import { qaStreamManager } from '../../managers/QAStreamManager';
import { AgentMemoryService } from '@Services/agentMemoryService';
import { useAIAgentStore } from '@Store/AIAgentStore';

export class FinishStreamingAnswerAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, data } = context;

    console.log('结束流式响应:', data);
    const finishQid = payload.QId;
    const finalResponse = payload.response || '';

    let qidStr: string | null = null;

    if (finishQid !== undefined && finishQid !== null) {
      qidStr = Array.isArray(finishQid) ? finishQid[0] : finishQid.toString();
    } else {
      // Fallback: use last streaming QA id or find processing QA
      qidStr = qaStreamManager.getStreamingQaId();
      if (!qidStr) {
        try {
          const state = useAIAgentStore.getState();
          const candidate = state.qaList.find((q) => q.onProcess);
          qidStr = candidate?.id || null;
        } catch {
          // Ignore store access errors
        }
      }
    }

    if (qidStr) {
      await globalUpdateInterface.finishStreamingAnswer(qidStr, finalResponse);
      qaStreamManager.clearStreamingQaId();

      // Record agent interaction completion
      try {
        const response = finalResponse;
        if (response) {
          const notebookState = (window as any).__notebookStore?.getState?.();
          const notebookId = notebookState?.notebookId;

          if (notebookId) {
            console.log('记录QA交互完成 - notebookId:', notebookId, '响应长度:', response.length);

            // Update current context state
            AgentMemoryService.updateCurrentContext(notebookId, 'general', {
              current_qa_id: qidStr,
              interaction_status: 'completed',
              completion_time: new Date().toISOString(),
              response_quality: response.length > 100 ? 'detailed' : 'brief',
            });

            // Record successful QA interaction
            AgentMemoryService.recordOperationInteraction(
              notebookId,
              'general',
              'qa_completed',
              true,
              {
                question_id: qidStr,
                response_length: response.length,
                completion_time: new Date().toISOString(),
                response_preview: response.substring(0, 200),
                interaction_type: 'qa_session',
              }
            );
          }
        }
      } catch (error) {
        console.error('记录QA交互时出错:', error);
      }
    } else {
      console.error('Missing QId in stream data:', data);
    }
  }
}

registerStreamAction('finishStreamingAnswer', FinishStreamingAnswerAction);
