/** NEXT_STEP Handler - STEP_COMPLETED → STEP_RUNNING */
import { BaseTransitionHandler } from './BaseTransitionHandler';
import { WorkflowState as WorkflowStateEnum, WorkflowEvent } from '@Store/models';
import { WorkflowState } from '../observation/WorkflowState';

export class NextStepHandler extends BaseTransitionHandler {
  constructor() {
    super(
      WorkflowStateEnum.STEP_COMPLETED,
      WorkflowStateEnum.STEP_RUNNING,
      WorkflowEvent.NEXT_STEP
    );
  }

  canHandle(apiResponse: any): boolean {
    return typeof apiResponse === 'object' && apiResponse._auto_trigger === 'NEXT_STEP';
  }

  async apply(state: WorkflowState, _apiResponse: any): Promise<WorkflowState> {
    const ns = this.deepCopyState(state);
    const p = ns.location.progress;
    const sp = p.steps;
    const cur = sp.current;

    // Determine next step from planned list
    const planned = sp.planned || [];
    const completedIds = (sp.completed || []).map((s: any) => s.step_id);
    const currentId = cur?.step_id;

    const planed = planned.filter(
      (s: any) => !completedIds.includes(s.step_id) && s.step_id !== currentId
    );

    if (cur) {
      if (!sp.completed) sp.completed = [];
      sp.completed.push({ ...cur, completion_status: 'success' });
    }

    if (!planed.length) {
      console.log('[NextStepHandler] No planed steps found, completing stage');
      this.updateFSMState(ns, WorkflowStateEnum.STAGE_COMPLETED, WorkflowEvent.COMPLETE_STAGE);
      return ns;
    }

    // Next step is the first one in the planed list
    const nextPlanned = planed[0];
    const next = {
      ...nextPlanned,
      goal: nextPlanned.task || '',
      verified_artifacts: {},
    };

    p.updateStepCurrent(next);
    sp.current_outputs = this.initOutputsTracking(next.verified_artifacts || {});

    this.updateLocationCurrent(ns, { step_id: next.step_id, behavior_id: 'clear' });
    this.updateFSMState(ns, WorkflowStateEnum.STEP_RUNNING, WorkflowEvent.NEXT_STEP);
    console.log(`[NextStepHandler] scriptStore available: ${!!this.scriptStore}`);
    if (next.title) {
      console.log(`[NextStepHandler] Executing new_step action for: ${next.title}`);
      await this.executeAction('new_step', next.title);
    } else {
      console.warn('[NextStepHandler] Next step has no title, skipping new_step action');
    }

    this.syncNotebookToState(ns);
    return ns;
  }
}
