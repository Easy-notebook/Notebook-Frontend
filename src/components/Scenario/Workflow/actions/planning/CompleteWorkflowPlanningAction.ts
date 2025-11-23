import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class CompleteWorkflowPlanningAction extends ActionBase {
  /**
   * Handle complete_workflow_planning action
   *
   * @param step - Execution step containing:
   *   - total_stages: Total number of stages planned
   */
  execute(step: ExecutionStep): void {
    const { total_stages } = step;

    // Get the workflow state machine's current state JSON
    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const observation = stateJSON.observation;

    console.log(
      `[CompleteWorkflowPlanningAction] Workflow planning complete with ${total_stages} stages`
    );

    // Mark workflow as planned (custom flag on FSM)
    // @ts-expect-error – we extend FSM with a custom flag
    stateJSON.state.FSM.workflow_planned = true;

    // If FSM is in IDLE state, transition to first planned stage
    if (stateJSON.state.FSM.state === 'IDLE') {
      const plannedStages = observation.location.progress.stages.planned || [];

      if (plannedStages.length > 0) {
        // Set current stage to the first planned stage
        observation.location.current.stage_id = plannedStages[0].stage_id;

        // Transition to STAGE_RUNNING
        stateJSON.state.FSM.state = 'STAGE_RUNNING';

        console.log(
          `[CompleteWorkflowPlanningAction] ✅ Transitioned to STAGE_RUNNING, current stage: ${plannedStages[0].stage_id}`
        );
      } else {
        console.warn('[CompleteWorkflowPlanningAction] No stages planned, cannot transition');
      }
    }

    // Update the workflow state machine with the modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('complete_workflow_planning', CompleteWorkflowPlanningAction);
