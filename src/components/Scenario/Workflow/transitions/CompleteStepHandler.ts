/** COMPLETE_STEP Handler - BEHAVIOR_COMPLETED → STEP_COMPLETED */
import { BaseTransitionHandler } from './BaseTransitionHandler';
import { ClearEffectHistoryAction } from '../actions/reflecting/ClearEffectHistory';
import { WorkflowState } from '../observation/WorkflowState';

export class CompleteStepHandler extends BaseTransitionHandler {
  constructor() {
    super('BEHAVIOR_COMPLETED', 'STEP_COMPLETED', 'COMPLETE_STEP');
  }

  canHandle(r: any): boolean {
    if (typeof r !== 'object' || r._auto_trigger) return false;
    const acts = r.actions || [];
    return acts.some(
      (a: any) => a?.type === 'mark_step_complete' || a?.type === 'mark-step-complete'
    );
  }

  async apply(state: WorkflowState, _r: any): Promise<WorkflowState> {
    const ns = this.deepCopyState(state);
    const p = ns.location.progress;

    if (p.behaviors.current) {
      p.completeCurrentBehavior('success');
    }

    if (p.steps.current) {
      p.setStepCompletionStatus('all_acceptance_criteria_passed');
    }

    // Clear effects.current and move to history
    if (ns.state.effects.current.length > 0) {
      // Move current effects to history
      ns.state.effects.moveCurrentToHistory();

      console.log(`[CompleteStepHandler] Moved effects to history`);
    }

    // Clear effect history to prepare for the next step
    ClearEffectHistoryAction.processState(ns);

    this.updateFSMState(ns, 'STEP_COMPLETED', 'COMPLETE_STEP');
    return ns;
  }
}
