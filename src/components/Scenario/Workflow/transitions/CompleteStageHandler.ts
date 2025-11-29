/** COMPLETE_STAGE Handler - STEP_COMPLETED → STAGE_COMPLETED */
import { BaseTransitionHandler } from './BaseTransitionHandler';
import { WorkflowState } from '../observation/WorkflowState';

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

  async apply(state: WorkflowState, _r: any): Promise<WorkflowState> {
    const ns = this.deepCopyState(state);
    const p = ns.location.progress;

    if (p.stages.current) {
      p.setStageCompletionStatus('success');
    }

    this.updateFSMState(ns, 'STAGE_COMPLETED', 'COMPLETE_STAGE');
    return ns;
  }
}
