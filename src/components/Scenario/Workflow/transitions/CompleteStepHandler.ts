/** COMPLETE_STEP Handler - BEHAVIOR_COMPLETED → STEP_COMPLETED */
import { BaseTransitionHandler } from './BaseTransitionHandler';
import { ClearEffectHistoryAction } from '../actions/reflecting/ClearEffectHistory';

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

  async apply(state: Record<string, any>, _r: any): Promise<Record<string, any>> {
    const ns = this.deepCopyState(state);
    const p = this.getProgress(ns);

    if (p.behaviors?.current) {
      if (!p.behaviors.completed) p.behaviors.completed = [];
      p.behaviors.completed.push({ ...p.behaviors.current, completion_status: 'success' });
      p.behaviors.current = null;
    }

    if (p.steps?.current) {
      p.steps.current.completion_status = 'all_acceptance_criteria_passed';
    }

    // Clear effects.current and move to history
    if (ns.state?.effects) {
      if (ns.state.effects.current && ns.state.effects.current.length > 0) {
        // Move current effects to history
        if (!ns.state.effects.history) {
          ns.state.effects.history = [];
        }
        ns.state.effects.history.push(...ns.state.effects.current);

        console.log(
          `[CompleteStepHandler] Moved ${ns.state.effects.current.length} effects to history`
        );

        // Clear current effects
        ns.state.effects.current = [];
      }
    }

    // Clear effect history to prepare for the next step
    ClearEffectHistoryAction.processState(ns);

    this.updateFSMState(ns, 'STEP_COMPLETED', 'COMPLETE_STEP');
    return ns;
  }
}
