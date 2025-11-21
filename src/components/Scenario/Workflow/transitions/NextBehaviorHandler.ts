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
      msc = false;
    acts.forEach((a: any) => {
      if (a?.type === 'complete_reflection') cr = true;
      if (a?.type === 'mark_step_complete') msc = true;
    });
    return cr && !msc;
  }

  apply(state: Record<string, any>, _r: any): Record<string, any> {
    const ns = this.deepCopyState(state);
    this.updateFSMState(ns, 'BEHAVIOR_RUNNING', 'NEXT_BEHAVIOR');
    return ns;
  }
}
