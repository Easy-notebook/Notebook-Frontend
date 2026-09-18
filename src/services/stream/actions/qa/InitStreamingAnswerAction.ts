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

export class InitStreamingAnswerAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, data } = context;

    agentLog.info('Initializing streaming response', { data });
    const qid = payload.QId;

    if (qid !== undefined && qid !== null) {
      const qidStr = Array.isArray(qid) ? qid[0] : qid.toString();
      await globalUpdateInterface.initStreamingAnswer(qidStr);

      // Record current streaming QA
      qaStreamManager.setStreamingQaId(qidStr);

      // Open right sidebar and switch to QA view
      try {
        const notebookState = useStore.getState();
        notebookState.setIsRightSidebarCollapsed(false);
        console.log('✅ [InitStreamingAnswer] 打开右侧边栏显示 QA');

        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        useAIAgentStore.getState().setActiveView('qa');
        console.log('✅ [InitStreamingAnswer] 切换到 QA 视图');
      } catch (error) {
        console.error('❌ [InitStreamingAnswer] 打开侧边栏失败:', error);
      }

      // Record QA interaction start
      try {
        const notebookState = (window as any).__notebookStore?.getState?.();
        const notebookId = notebookState?.notebookId;

        if (notebookId) {
          agentLog.info('Recording QA interaction start', { qid: qidStr });

          AgentMemoryService.updateCurrentContext(notebookId, 'general', {
            current_qa_id: qidStr,
            interaction_start_time: new Date().toISOString(),
            interaction_status: 'in_progress',
          });
        }
      } catch (error) {
        console.error('记录QA开始时出错:', error);
      }
    } else {
      console.error('Missing QId in stream data:', data);
    }
  }
}

registerStreamAction('initStreamingAnswer', InitStreamingAnswerAction);
