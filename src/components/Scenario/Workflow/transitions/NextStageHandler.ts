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

      // ✅ Preserve steps history from current stage for UI display and debugging
      const stepsHistory = {
        planned: (p.steps?.planned || []).map((step: any) => ({
          step_id: step.step_id,
          title: step.title,
          task: step.task,
          acceptance: step.acceptance,
        })),
        completed: (p.steps?.completed || []).map((step: any) => ({
          step_id: step.step_id,
          title: step.title,
          goal: step.goal,
          verified_artifacts: step.verified_artifacts || {},
        })),
      };

      sp.completed.push({
        ...cur,
        completion_status: 'success',
        steps: stepsHistory,
      });

      console.log(
        `[NextStageHandler] ✅ Completed stage ${cur.stage_id} with ${stepsHistory.completed.length}/${stepsHistory.planned.length} steps`
      );
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

    // ✅ FIX: Properly initialize steps structure for new stage
    // Instead of just clearing with {}, initialize with proper structure
    p.steps = {
      planned: [],
      current: null,
      completed: [],
    };

    console.log(`[NextStageHandler] Cleared and initialized steps for new stage: ${next.stage_id}`);

    this.updateFSMState(ns, 'STAGE_RUNNING', 'NEXT_STAGE');
    if (next.title) await this.executeAction('new_section', next.title);
    this.syncNotebookToState(ns);
    return ns;
  }
}
