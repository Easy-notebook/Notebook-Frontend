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

    // IMPORTANT: Update workflowTemplate with steps for current stage
    this.syncStepsToWorkflowTemplate(ns, steps);

    this.syncNotebookToState(ns);
    return ns;
  }

  /**
   * Sync steps to PipelineStore's workflowTemplate
   * This ensures the UI displays the correct steps for the current stage
   */
  private syncStepsToWorkflowTemplate(state: Record<string, any>, steps: any[]): void {
    try {
      // Get current stage ID
      const currentStageId = state.observation?.location?.current?.stage_id;
      if (!currentStageId) {
        console.warn('[StartStep] Cannot sync steps: no current stage_id');
        return;
      }

      // Import PipelineStore dynamically to avoid circular dependencies
      import('../store/usePipelineStore').then(({ usePipelineStore }) => {
        const pipelineStore = usePipelineStore.getState();

        // Convert steps from Planning API format to WorkflowStep format
        const workflowSteps = steps.map((step, index) => ({
          id: step.step_id,
          step_id: step.step_id,
          title: step.title || `Step ${index + 1}`,
          description: step.goal || '',
          metadata: {
            verified_artifacts: step.verified_artifacts || {},
            required_variables: step.required_variables || {},
          },
        }));

        console.log(
          '[StartStep] Updating',
          workflowSteps.length,
          'steps for stage:',
          currentStageId
        );
        pipelineStore.updateStepsForStage(currentStageId, workflowSteps);
      });
    } catch (error) {
      console.error('[StartStep] Failed to sync steps to workflow template:', error);
    }
  }
}
