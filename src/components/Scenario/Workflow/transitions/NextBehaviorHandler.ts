/** NEXT_BEHAVIOR Handler - BEHAVIOR_COMPLETED → BEHAVIOR_RUNNING */
import { BaseTransitionHandler } from './BaseTransitionHandler';

export class NextBehaviorHandler extends BaseTransitionHandler {
  constructor() {
    super('BEHAVIOR_COMPLETED', 'BEHAVIOR_RUNNING', 'NEXT_BEHAVIOR');
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

  async apply(state: Record<string, any>, r: any): Promise<Record<string, any>> {
    const ns = this.deepCopyState(state);

    // Check for update_focus in continue_behavior action
    const acts = r.actions || [];
    const continueAction = acts.find((a: any) => a?.type === 'continue_behavior');

    if (continueAction && continueAction.update_focus) {
      console.log(`[NextBehaviorHandler] Updating focus: ${continueAction.update_focus}`);
      const p = this.getProgress(ns);
      if (p.behaviors) {
        p.behaviors.focus = continueAction.update_focus;
      }

      // Also update location.goals if appropriate
      const location = this.getLocation(ns);
      if (location) {
        location.goals = continueAction.update_focus;
      }
    }

    this.updateFSMState(ns, 'BEHAVIOR_RUNNING', 'NEXT_BEHAVIOR');
    return ns;
  }
}
