/** COMPLETE_STAGE Handler - STEP_COMPLETED → STAGE_COMPLETED */
import { BaseTransitionHandler } from './BaseTransitionHandler';

export class CompleteStageHandler extends BaseTransitionHandler {
  constructor() {
    super('STEP_COMPLETED', 'STAGE_COMPLETED', 'COMPLETE_STAGE');
  }

  canHandle(r: any): boolean {
    if (typeof r !== 'object') return false;
    if (r._auto_trigger === 'COMPLETE_STAGE') return true;
    const acts = r.actions || [];
    return acts.some((a: any) => a?.type === 'mark_stage_complete');
  }

  async apply(state: Record<string, any>, _r: any): Promise<Record<string, any>> {
    const ns = this.deepCopyState(state);
    const p = this.getProgress(ns);

    if (p.stages?.current) {
      p.stages.current.completion_status = 'all_steps_completed';
    }

    this.updateFSMState(ns, 'STAGE_COMPLETED', 'COMPLETE_STAGE');
    return ns;
  }
}
