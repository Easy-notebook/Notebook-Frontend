/** NEXT_STAGE Handler - STAGE_COMPLETED → STAGE_RUNNING */
import { BaseTransitionHandler } from './BaseTransitionHandler';

export class NextStageHandler extends BaseTransitionHandler {
  constructor() {
    super('STAGE_COMPLETED', 'STAGE_RUNNING', 'NEXT_STAGE');
  }

  canHandle(r: any): boolean {
    return typeof r === 'object' && r._auto_trigger === 'NEXT_STAGE';
  }

  apply(state: Record<string, any>, _r: any): Record<string, any> {
    const ns = this.deepCopyState(state);
    const p = this.getProgress(ns);
    const sp = p.stages || {};
    const cur = sp.current;
    const rem = sp.remaining || [];

    if (cur) {
      if (!sp.completed) sp.completed = [];
      sp.completed.push({ ...cur, completion_status: 'success' });
    }

    if (!rem.length) {
      this.updateFSMState(ns, 'COMPLETE', 'NO_MORE_STAGES');
      return ns;
    }

    const next = rem[0];
    sp.current = next;
    sp.remaining = rem.slice(1);
    sp.current_outputs = this.initOutputsTracking(next.verified_artifacts || {});

    this.updateLocationCurrent(ns, {
      stage_id: next.stage_id,
      step_id: 'clear',
      behavior_id: 'clear',
    });
    if (p.steps) p.steps = {};

    this.updateFSMState(ns, 'STAGE_RUNNING', 'NEXT_STAGE');
    if (next.title) this.executeAction('new_section', next.title);
    this.syncNotebookToState(ns);
    return ns;
  }
}
