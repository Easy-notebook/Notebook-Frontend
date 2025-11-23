/**
 * Trigger Image Generation Action - Handles trigger_image_generation stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class TriggerImageGenerationAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const prompt = payload.prompt;
    const commandId = payload.commandId;

    if (prompt && commandId) {
      console.log('触发图片生成:', prompt);

      // 获取当前notebook状态
      const notebookState = useStore.getState();
      const notebookId = notebookState.notebookId;
      const viewMode = notebookState.viewMode;
      const currentPhaseId = notebookState.currentPhaseId;
      const currentStepIndex = notebookState.currentStepIndex;

      // 使用 dynamic import 来获取 operatorStore 以避免循环依赖
      const { default: useOperatorStore } = await import('@Store/operatorStore');

      // 发送/image命令到后端
      const imageCommand = {
        type: 'user_command',
        payload: {
          content: `/image ${prompt}`,
          commandId: commandId,
          current_view_mode: viewMode,
          current_phase_id: currentPhaseId,
          current_step_index: currentStepIndex,
          notebook_id: notebookId,
        },
      };

      console.log('发送图片生成命令到后端:', imageCommand);
      useOperatorStore.getState().sendOperation(notebookId, imageCommand);

      await showToast({
        message: `开始生成图片: ${prompt.substring(0, 30)}...`,
        type: 'info',
      });

      // 将工具调用记录到当前进行中的 QA（如果有）
      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const state = useAIAgentStore.getState();
        const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];
        if (runningQA) {
          state.addToolCallToQA(runningQA.id, {
            type: 'draw-image',
            content: prompt,
            agent: 'image-generator',
          });
        }
      } catch (error) {
        console.error('添加工具调用到QA失败:', error);
      }
    }
  }
}

registerStreamAction('trigger_image_generation', TriggerImageGenerationAction);
