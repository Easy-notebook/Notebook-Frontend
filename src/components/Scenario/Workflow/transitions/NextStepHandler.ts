/** NEXT_STEP Handler - STEP_COMPLETED → STEP_RUNNING */
import { BaseTransitionHandler } from './BaseTransitionHandler';

export class NextStepHandler extends BaseTransitionHandler {
  constructor() {
    super('STEP_COMPLETED', 'STEP_RUNNING', 'NEXT_STEP');
  }

  canHandle(r: any): boolean {
    return typeof r === 'object' && r._auto_trigger === 'NEXT_STEP';
  }

  async apply(state: Record<string, any>, _r: any): Promise<Record<string, any>> {
    const ns = this.deepCopyState(state);
    const p = this.getProgress(ns);
    const sp = p.steps || {};
    const rem = sp.remaining || [];

    if (!rem.length) {
      this.updateFSMState(ns, 'STAGE_COMPLETED', 'NO_MORE_STEPS');
      return ns;
    }

    const next = rem[0];
    sp.current = next;
    sp.remaining = rem.slice(1);
    sp.current_outputs = this.initOutputsTracking(next.verified_artifacts || {});

    this.updateLocationCurrent(ns, { step_id: next.step_id, behavior_id: 'clear' });
    this.updateFSMState(ns, 'STEP_RUNNING', 'NEXT_STEP');
    if (next.title) await this.executeAction('new_step', next.title);
    this.syncNotebookToState(ns);
    return ns;
  }
}
