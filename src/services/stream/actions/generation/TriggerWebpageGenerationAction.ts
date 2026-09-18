/**
 * Trigger Webpage Generation Action - Handles trigger_webpage_generation stream type
 * Sends /webpage command to backend to generate a webpage
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';

export class TriggerWebpageGenerationAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const prompt = payload.prompt;
    const commandId = payload.commandId;

    if (prompt && commandId) {
      console.log('触发网页生成:', prompt);

      // Get current notebook state
      const notebookState = useStore.getState();
      const notebookId = notebookState.notebookId;
      const viewMode = notebookState.viewMode;
      const currentPhaseId = notebookState.currentPhaseId;
      const currentStepIndex = notebookState.currentStepIndex;

      // Use dynamic import to avoid circular dependencies
      const { default: useOperatorStore } = await import('@Store/operatorStore');

      // Send /webpage command to backend
      const webpageCommand = {
        type: 'user_command',
        payload: {
          content: `/webpage ${prompt}`,
          commandId: commandId,
          current_view_mode: viewMode,
          current_phase_id: currentPhaseId,
          current_step_index: currentStepIndex,
          notebook_id: notebookId,
        },
      };

      console.log('发送网页生成命令到后端:', webpageCommand);
      useOperatorStore.getState().sendOperation(notebookId, webpageCommand);

      await showToast({
        message: `开始生成网页: ${prompt.substring(0, 30)}...`,
        type: 'info',
      });

      // Record tool call to current QA if available
      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const state = useAIAgentStore.getState();
        const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];
        if (runningQA) {
          state.addToolCallToQA(runningQA.id, {
            type: 'generate-webpage',
            content: prompt,
            agent: 'webpage-generator',
          });
        }
      } catch (error) {
        console.error('添加工具调用到QA失败:', error);
      }
    }
  }
}

registerStreamAction('trigger_webpage_generation', TriggerWebpageGenerationAction);
