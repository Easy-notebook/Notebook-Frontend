/**
 * COMPLETE_WORKFLOW Handler
 * Transition: STAGE_COMPLETED → COMPLETED
 */
import { BaseTransitionHandler } from './BaseTransitionHandler';

export class CompleteWorkflowHandler extends BaseTransitionHandler {
  constructor() {
    super('STAGE_COMPLETED', 'COMPLETED', 'COMPLETE_WORKFLOW');
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

  async apply(state: Record<string, any>, _apiResponse: any): Promise<Record<string, any>> {
    console.log('[CompleteWorkflow] Completing workflow...');

    const newState = this.deepCopyState(state);

    // Update FSM state to COMPLETED
    this.updateFSMState(newState, 'COMPLETED', 'COMPLETE_WORKFLOW');

    console.log('[CompleteWorkflow] Workflow completed successfully');
    return newState;
  }
}
