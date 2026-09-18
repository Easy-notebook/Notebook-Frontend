/**
 * Add Content To Answer Action - Handles addContentToAnswer stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class AddContentToAnswerAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload } = context;

    console.log('添加内容到流式响应:', payload);
    const contentQid = payload.QId;
    const content = payload.content;

    if (contentQid !== undefined && contentQid !== null && content) {
      const qidStr = Array.isArray(contentQid) ? contentQid[0] : contentQid.toString();
      await globalUpdateInterface.addContentToAnswer(qidStr, content.toString());

      // Ensure right sidebar is open and showing QA view
      try {
        const notebookState = useStore.getState();
        if (notebookState.isRightSidebarCollapsed) {
          notebookState.setIsRightSidebarCollapsed(false);
          console.log('✅ [AddContentToAnswer] 打开右侧边栏显示 QA');
        }

        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const aiState = useAIAgentStore.getState();
        if (aiState.activeView !== 'qa') {
          aiState.setActiveView('qa');
          console.log('✅ [AddContentToAnswer] 切换到 QA 视图');
        }
      } catch (error) {
        console.error('❌ [AddContentToAnswer] 确保侧边栏显示失败:', error);
      }
    } else {
      console.error('Missing QId or content in stream data:', payload);
    }
  }
}

registerStreamAction('addContentToAnswer', AddContentToAnswerAction);
