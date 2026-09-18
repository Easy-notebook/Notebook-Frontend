/**
 * Workflow Stage Changed Action - Handles workflow_stage_changed stream type
 * Notifies about workflow stage transitions
 */

import { StreamAction, registerStreamAction } from '../base';
import type { StreamActionContext } from '../../types';

export class WorkflowStageChangedAction extends StreamAction {
  async execute(context: StreamActionContext): Promise<void> {
    const { payload, showToast } = context;
    const stage = payload?.stage;
    const stageId = payload?.stageId;
    const previousStage = payload?.previousStage;

    if (stage) {
      console.log(`[WorkflowStage] ${previousStage || 'unknown'} → ${stage}`);

      await showToast({
        message: `工作流已切换到: ${stage}`,
        type: 'info',
      });

      // Record stage change to agent memory
      try {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        const state = useAIAgentStore.getState();
        const runningQA = state.qaList.find((q: any) => q.onProcess) || state.qaList[0];

        if (runningQA) {
          state.addToolCallToQA(runningQA.id, {
            type: 'workflow-stage-change',
            content: `${previousStage || '开始'} → ${stage}`,
            agent: 'workflow-manager',
            metadata: {
              stage,
              stageId,
              previousStage,
            },
          });
        }
      } catch (error) {
        console.error('Failed to record workflow stage change:', error);
      }
    }
  }
}

registerStreamAction('workflow_stage_changed', WorkflowStageChangedAction);
