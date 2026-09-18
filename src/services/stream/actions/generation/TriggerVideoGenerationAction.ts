/**
 * Trigger Video Generation Action - Handles trigger_video_generation stream type
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';
import useStore from '@Store/notebookStore';
import { useAIAgentStore } from '@Store/AIAgentStore';

export class TriggerVideoGenerationAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;

    const prompt = payload.prompt;
    const commandId = payload.commandId;

    if (!prompt || !commandId) {
      console.error('❌ Missing prompt or commandId for video generation');
      return;
    }

    console.log('触发视频生成:', prompt);

    const notebookState = useStore.getState();
    const notebookId = notebookState.notebookId;
    const viewMode = notebookState.viewMode;
    const currentPhaseId = notebookState.currentPhaseId;
    const currentStepIndex = notebookState.currentStepIndex;

    const { default: useOperatorStore } = await import('@Store/operatorStore');

    const videoCommand = {
      type: 'user_command',
      payload: {
        content: `/video ${prompt}`,
        commandId: commandId,
        current_view_mode: viewMode,
        current_phase_id: currentPhaseId,
        current_step_index: currentStepIndex,
        notebook_id: notebookId,
      },
    };

    console.log('发送视频生成命令到后端:', videoCommand);
    useOperatorStore.getState().sendOperation(notebookId, videoCommand);

    await showToast({ message: `开始生成视频: ${prompt.substring(0, 30)}...`, type: 'info' });

    // Record tool call to current QA
    try {
      const state = useAIAgentStore.getState();
      const runningQA = state.qaList.find((q) => q.onProcess) || state.qaList[0];
      if (runningQA) {
        state.addToolCallToQA(runningQA.id, {
          type: 'create-video',
          content: prompt,
          agent: 'video-generator',
        });
      }
    } catch {
      // Ignore agent store update errors
    }
  }
}

registerStreamAction('trigger_video_generation', TriggerVideoGenerationAction);
