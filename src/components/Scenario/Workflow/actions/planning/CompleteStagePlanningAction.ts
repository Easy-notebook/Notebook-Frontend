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
    // Backend sends stage_id, but convertActionToExecutionStep converts it to stageId
    const stageId = (step as any).stageId || (step as any).stage_id;
    const totalSteps = (step as any).totalSteps || (step as any).total_steps;

    if (!stageId) {
      console.error('[CompleteStagePlanningAction] Missing stage_id:', step);
      return;
    }

    // Use WorkflowStateMachine as the single source of truth
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;

    // ✅ VALIDATION: Ensure we're processing the current stage, not a previous one
    const currentStageId = stateJSON.observation.location.current.stage_id;

    if (stageId !== currentStageId) {
      console.warn(
        `[CompleteStagePlanningAction] ⚠️ Ignoring stale planning completion for stage ${stageId}, current stage is ${currentStageId}`
      );
      return;
    }

    console.log(
      `[CompleteStagePlanningAction] Stage planning complete: ${stageId} with ${totalSteps} steps`
    );

    // Find and mark stage as planning complete
    const stage = stateJSON.observation.location.progress.stages.planned?.find(
      (s: any) => s.stage_id === stageId
    );

    if (stage) {
      // Check if planning was already completed for this stage
      if (stage.planning_complete) {
        console.warn(
          `[CompleteStagePlanningAction] ⚠️ Planning already completed for stage ${stageId}, skipping`
        );
        return;
      }
      stage.planning_complete = true;
    }

    // If FSM is in STAGE_RUNNING, prepare to transition to first step
    if (stateJSON.state.FSM.state === 'STAGE_RUNNING') {
      const plannedSteps = stateJSON.observation.location.progress.steps.planned || [];

      // ✅ VALIDATION: Verify we have fresh steps for the current stage
      if (plannedSteps.length === 0) {
        console.warn(
          `[CompleteStagePlanningAction] ⚠️ No steps planned for stage ${stageId}, cannot transition`
        );
        return;
      }

      console.log(
        `[CompleteStagePlanningAction] Processing ${plannedSteps.length} steps for stage ${stageId}`
      );

      // Set current step to the first planned step
      stateJSON.observation.location.current.step_id = plannedSteps[0].step_id;

      // IMPORTANT: We no longer populate 'planed'.
      // It is derived dynamically from planned - completed - current.

      const currentStep = {
        ...plannedSteps[0],
        goal: plannedSteps[0].task || '',
        verified_artifacts: {},
      };

      stateJSON.observation.location.progress.steps.current = currentStep;
      stateJSON.observation.location.progress.steps.completed = [];

      console.log(
        `[CompleteStagePlanningAction] Initialized current step: ${currentStep.step_id} for stage ${stageId}`
      );

      // Transition to STEP_RUNNING
      stateJSON.state.FSM.state = 'STEP_RUNNING';

      console.log(
        `[CompleteStagePlanningAction] ✅ Transitioned to STEP_RUNNING, current step: ${plannedSteps[0].step_id}`
      );
    } else {
      console.warn(
        `[CompleteStagePlanningAction] ⚠️ FSM state is ${stateJSON.state.FSM.state}, expected STAGE_RUNNING`
      );
    }

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('complete_stage_planning', CompleteStagePlanningAction);
