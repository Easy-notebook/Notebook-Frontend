/**
 * CompleteStepPlanningAction - Marks step planning as complete
 * Action Type: complete_step_planning
 *
 * Transitions from STEP_RUNNING to BEHAVIOR_RUNNING
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class CompleteStepPlanningAction extends ActionBase {
  /**
   * Handle complete_step_planning action
   *
   * @param step - Execution step containing:
   *   - step_id: Step identifier
   */
  execute(step: ExecutionStep): void {
    // Backend sends step_id, but convertActionToExecutionStep converts it to stepId
    const step_id = step.stepId || step.step_id;

    if (!step_id) {
      console.error('[CompleteStepPlanningAction] Missing step_id:', step);
      return;
    }

    // Use WorkflowStateMachine as the single source of truth
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    console.log(`[CompleteStepPlanningAction] Step planning complete: ${step_id}`);

    // Find and mark step as planning complete
    const currentStep = stateJSON.observation.location.progress.steps.planned?.find(
      (s) => s.step_id === step_id
    );

    if (currentStep) {
      currentStep.planning_complete = true;
    }

    // Transition to BEHAVIOR_RUNNING, ready to call /generating API
    // This follows the same pattern as CompleteWorkflowPlanningAction and CompleteStagePlanningAction
    if (stateJSON.state.FSM.state === 'STEP_RUNNING') {
      stateJSON.state.FSM.state = 'BEHAVIOR_RUNNING';
      console.log('[CompleteStepPlanningAction] ✅ Transitioned to BEHAVIOR_RUNNING');
    }

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('complete_step_planning', CompleteStepPlanningAction);
