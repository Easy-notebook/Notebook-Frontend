/** START_STEP Handler - STAGE_RUNNING → STEP_RUNNING */
import { BaseTransitionHandler } from './BaseTransitionHandler';

export class StartStepHandler extends BaseTransitionHandler {
  constructor() {
    super('STAGE_RUNNING', 'STEP_RUNNING', 'START_STEP');
  }

  canHandle(r: any): boolean {
    // Legacy format: steps array
    if (typeof r === 'object' && 'steps' in r && Array.isArray(r.steps)) return true;

    // Streaming format: actions array
    if (typeof r === 'object' && 'actions' in r && Array.isArray(r.actions)) {
      // Check if any action is a step planning action
      return r.actions.some(
        (a: any) =>
          a.type === 'plan_step' || a.type === 'add_step' || a.type === 'complete_stage_planning' // This might be the trigger
      );
    }
    return false;
  }

  async apply(state: Record<string, any>, r: any): Promise<Record<string, any>> {
    const ns = this.deepCopyState(state);
    let steps = r.steps || [];

    // Extract steps from actions if using streaming format
    if (!steps.length && r.actions && Array.isArray(r.actions)) {
      console.log('[StartStep] Extracting steps from streaming actions');

      // Filter for plan_step actions
      const stepActions = r.actions.filter(
        (a: any) => a.type === 'plan_step' || a.type === 'add_step'
      );

      if (stepActions.length > 0) {
        steps = stepActions.map((a: any) => ({
          step_id: a.step_id || a.stepId,
          title: a.title || a.content || '',
          goal: a.goal || a.task || '',
          verified_artifacts: a.verified_artifacts || a.outputs || {},
        }));

        // Also check for focus in actions
        if (!r.focus) {
          const focusAction = r.actions.find((a: any) => a.type === 'update_focus');
          if (focusAction) {
            r.focus = focusAction.focus || focusAction.content;
          }
        }
      }
    }

    if (!steps.length) {
      console.warn('[StartStep] No steps found in response');
      return ns;
    }

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
    if (fs.title) await this.executeAction('new_step', fs.title);

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
