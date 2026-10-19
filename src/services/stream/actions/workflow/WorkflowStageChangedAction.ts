import { CapturedQAEvent } from '../../CapturedQAEvent';
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

      const captured = new CapturedQAEvent(
        {
          type: 'workflow-stage-change',
          content: `${previousStage || '开始'} → ${stage}`,
          agent: 'workflow-manager',
          metadata: { stage, stageId, previousStage },
        },
        payload.QId
      );

      await showToast({
        message: `工作流已切换到: ${stage}`,
        type: 'info',
      });

      captured.record();
    }
  }
}

registerStreamAction('workflow_stage_changed', WorkflowStageChangedAction);
