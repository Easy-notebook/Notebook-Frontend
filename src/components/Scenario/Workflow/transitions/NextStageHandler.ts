/** NEXT_STAGE Handler - STAGE_COMPLETED → STAGE_RUNNING */
import { BaseTransitionHandler } from './BaseTransitionHandler';

export class NextStageHandler extends BaseTransitionHandler {
  constructor() {
    super('STAGE_COMPLETED', 'STAGE_RUNNING', 'NEXT_STAGE');
  }

  canHandle(apiResponse: any): boolean {
    return typeof apiResponse === 'object' && apiResponse._auto_trigger === 'NEXT_STAGE';
  }

  async apply(state: Record<string, any>, _apiResponse: any): Promise<Record<string, any>> {
    const ns = this.deepCopyState(state);
    const p = this.getProgress(ns);
    const sp = p.stages || {};
    const cur = sp.current;

    // Determine next stage from planned list
    const planned = sp.planned || [];
    const completedIds = (sp.completed || []).map((s: any) => s.stage_id);
    const currentId = cur?.stage_id;

    const planed = planned.filter(
      (s: any) => !completedIds.includes(s.stage_id) && s.stage_id !== currentId
    );

    if (cur) {
      if (!sp.completed) sp.completed = [];
      sp.completed.push({ ...cur, completion_status: 'success' });
    }

    if (!planed.length) {
      console.log('[NextStageHandler] No planed stages found, completing workflow');
      this.updateFSMState(ns, 'COMPLETE', 'NO_MORE_STAGES');
      return ns;
    }

    // Next stage is the first one in the planed list
    // We need to map it to the expected format (goal, verified_artifacts)
    const nextPlanned = planed[0];
    const next = {
      ...nextPlanned,
      goal: nextPlanned.task || '',
      verified_artifacts: {},
    };

    sp.current = next;
    // No need to update 'planed' array anymore
    sp.current_outputs = this.initOutputsTracking(next.verified_artifacts || {});

    this.updateLocationCurrent(ns, {
      stage_id: next.stage_id,
      step_id: 'clear',
      behavior_id: 'clear',
    });
    if (p.steps) p.steps = {};

    this.updateFSMState(ns, 'STAGE_RUNNING', 'NEXT_STAGE');
    if (next.title) await this.executeAction('new_section', next.title);
    this.syncNotebookToState(ns);
    return ns;
  }
}
