/**
 * COMPLETE_WORKFLOW Handler
 * Transition: STAGE_COMPLETED → COMPLETE
 */
import { BaseTransitionHandler } from './BaseTransitionHandler';
import { WorkflowState as WorkflowStateEnum, WorkflowEvent } from '@Store/models';
import { WorkflowState } from '../observation/WorkflowState';

export class CompleteWorkflowHandler extends BaseTransitionHandler {
  constructor() {
    super(
      WorkflowStateEnum.STAGE_COMPLETED,
      WorkflowStateEnum.COMPLETE,
      WorkflowEvent.COMPLETE_WORKFLOW
    );
  }

  canHandle(apiResponse: any): boolean {
    // This handler is usually auto-triggered by StageCompletedState
    // when there are no more stages planed.
    if (typeof apiResponse !== 'object') return false;

    // Check for explicit auto-trigger flag
    if (apiResponse._auto_trigger === 'COMPLETE_WORKFLOW') return true;

    // Also check for explicit action if applicable (though usually logic-only)
    const acts = apiResponse.actions || [];
    return acts.some((a: any) => a?.type === 'complete_workflow');
  }

  async apply(state: WorkflowState, _apiResponse: any): Promise<WorkflowState> {
    console.log('[CompleteWorkflow] Completing workflow...');

    const newState = this.deepCopyState(state);

    // Update FSM state to COMPLETE
    this.updateFSMState(newState, WorkflowStateEnum.COMPLETE, WorkflowEvent.COMPLETE_WORKFLOW);

    console.log('[CompleteWorkflow] Workflow completed successfully');
    return newState;
  }
}
