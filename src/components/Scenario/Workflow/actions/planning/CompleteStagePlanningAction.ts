/**
 * CompleteStagePlanningAction - Marks stage planning as complete
 * Action Type: complete_stage_planning
 *
 * Transitions from STAGE_RUNNING to STEP_RUNNING
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class CompleteStagePlanningAction extends ActionBase {
  /**
   * Handle complete_stage_planning action
   *
   * @param step - Execution step containing:
   *   - stage_id: Stage identifier
   *   - total_steps: Total number of steps planned
   */
  execute(step: ExecutionStep): void {
    const { stage_id, total_steps } = step;

    if (!stage_id) {
      console.error('[CompleteStagePlanningAction] Missing stage_id:', step);
      return;
    }

    // Use WorkflowStateMachine as the single source of truth
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    console.log(
      `[CompleteStagePlanningAction] Stage planning complete: ${stage_id} with ${total_steps} steps`
    );

    // Find and mark stage as planning complete
    const stage = stateJSON.observation.location.progress.stages.planned?.find(
      (s: any) => s.stage_id === stage_id
    );

    if (stage) {
      stage.planning_complete = true;
    }

    // If FSM is in STAGE_RUNNING, prepare to transition to first step
    if (stateJSON.state.FSM.state === 'STAGE_RUNNING') {
      const plannedSteps = stateJSON.observation.location.progress.steps.planned || [];

      if (plannedSteps.length > 0) {
        // Set current step to the first planned step
        stateJSON.observation.location.current.step_id = plannedSteps[0].step_id;

        // Transition to STEP_RUNNING
        stateJSON.state.FSM.state = 'STEP_RUNNING';

        console.log(
          `[CompleteStagePlanningAction] ✅ Transitioned to STEP_RUNNING, current step: ${plannedSteps[0].step_id}`
        );
      } else {
        console.warn('[CompleteStagePlanningAction] No steps planned, cannot transition');
      }
    }

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('complete_stage_planning', CompleteStagePlanningAction);
