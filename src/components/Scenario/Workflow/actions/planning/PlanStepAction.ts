/**
 * PlanStepAction - Creates or updates a step in the current stage plan
 * Action Type: plan_step
 *
 * Used during STAGE_RUNNING state to build stage-level plan
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class PlanStepAction extends ActionBase {
  /**
   * Handle plan_step action - create or update a step in the stage plan
   *
   * @param step - Execution step containing:
   *   - step_id: Unique identifier for the step
   *   - title: Step title
   *   - task: Task description
   *   - acceptance: Acceptance criteria
   */
  execute(step: ExecutionStep): void {
    const { step_id, title, task, acceptance } = step;

    if (!step_id || !title || !task || !acceptance) {
      console.error('[PlanStepAction] Missing required fields:', step);
      return;
    }

    // Use WorkflowStateMachine as the single source of truth
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const observation = stateJSON.observation;

    // Initialize planned steps array if not exists
    if (!observation.location.progress.steps.planned) {
      observation.location.progress.steps.planned = [];
    }

    // Check if step already exists
    const existingIndex = observation.location.progress.steps.planned.findIndex(
      (s: any) => s.step_id === step_id
    );

    const stepData = {
      step_id,
      title,
      task,
      acceptance,
      planning_complete: false,
    };

    if (existingIndex >= 0) {
      // Update existing step
      observation.location.progress.steps.planned[existingIndex] = {
        ...observation.location.progress.steps.planned[existingIndex],
        ...stepData,
      };
      console.log(`[PlanStepAction] ✅ Updated step: ${step_id}`);
    } else {
      // Add new step
      observation.location.progress.steps.planned.push(stepData);
      console.log(`[PlanStepAction] ✅ Added new step: ${step_id}`);
    }

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('plan_step', PlanStepAction);
