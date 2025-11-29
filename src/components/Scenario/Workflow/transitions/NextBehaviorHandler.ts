/** NEXT_BEHAVIOR Handler - BEHAVIOR_COMPLETED → BEHAVIOR_RUNNING */
import { BaseTransitionHandler } from './BaseTransitionHandler';
import { WorkflowState } from '../observation/WorkflowState';
import { WorkflowState as WorkflowStateEnum, WorkflowEvent } from '@Store/models';

export class NextBehaviorHandler extends BaseTransitionHandler {
  constructor() {
    super(
      WorkflowStateEnum.BEHAVIOR_COMPLETED,
      WorkflowStateEnum.BEHAVIOR_RUNNING,
      WorkflowEvent.NEXT_BEHAVIOR
    );
  }

  canHandle(r: any): boolean {
    if (typeof r !== 'object') return false;
    const acts = r.actions || [];
    let cr = false,
      msc = false,
      cb = false;
    acts.forEach((a: any) => {
      if (a?.type === 'complete_reflection') cr = true;
      if (a?.type === 'mark_step_complete' || a?.type === 'mark-step-complete') msc = true;
      if (a?.type === 'continue_behavior') cb = true;
    });
    // Can handle if (complete_reflection AND NOT mark_step_complete) OR continue_behavior
    return (cr && !msc) || cb;
  }

  async apply(state: WorkflowState, r: any): Promise<WorkflowState> {
    const ns = this.deepCopyState(state);

    // Check for update_focus in continue_behavior action
    const acts = r.actions || [];
    const continueAction = acts.find((a: any) => a?.type === 'continue_behavior');

    if (continueAction && continueAction.update_focus) {
      console.log(`[NextBehaviorHandler] Updating focus: ${continueAction.update_focus}`);
      const p = ns.location.progress;
      p.setBehaviorFocus(continueAction.update_focus);

      // Also update location.goals if appropriate
      ns.location.setGoals(continueAction.update_focus);
    }

    this.updateFSMState(ns, WorkflowStateEnum.BEHAVIOR_RUNNING, WorkflowEvent.NEXT_BEHAVIOR);
    return ns;
  }
}
