/** START_STEP Handler - STAGE_RUNNING → STEP_RUNNING */
import { BaseTransitionHandler } from './BaseTransitionHandler';

export class StartStepHandler extends BaseTransitionHandler {
  constructor() {
    super('STAGE_RUNNING', 'STEP_RUNNING', 'START_STEP');
  }

  canHandle(r: any): boolean {
    return typeof r === 'object' && 'steps' in r && Array.isArray(r.steps);
  }

  apply(state: Record<string, any>, r: any): Record<string, any> {
    const ns = this.deepCopyState(state);
    const steps = r.steps || [];
    if (!steps.length) return ns;

    const p = this.getProgress(ns);
    if (!p.steps) p.steps = {};
    const sp = p.steps;
    const fs = steps[0];

    sp.current = {
      step_id: fs.step_id,
      title: fs.title || '',
      goal: fs.goal || '',
      verified_artifacts: fs.verified_artifacts || {},
    };
    sp.completed = [];
    sp.focus = r.focus || '';
    sp.remaining = steps.slice(1);
    sp.current_outputs = this.initOutputsTracking(fs.verified_artifacts || {});

    this.updateLocationCurrent(ns, { step_id: fs.step_id, behavior_id: 'clear' });
    this.updateFSMState(ns, 'STEP_RUNNING', 'START_STEP');
    if (fs.title) this.executeAction('new_step', fs.title);

    // Note: Steps data is already stored in ns.observation.location.progress.steps
    // UI components should read directly from stateJSON instead of a separate store

    this.syncNotebookToState(ns);
    return ns;
  }

  /**
   * REMOVED: syncStepsToWorkflowTemplate
   *
   * Previously synced to usePipelineStore (now deprecated).
   * UI components should read directly from stateJSON.observation.location.progress.steps
   * instead of using a separate workflowTemplate store.
   */
}
