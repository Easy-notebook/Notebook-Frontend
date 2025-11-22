/**
 * CompleteWorkflowPlanningAction - Marks workflow planning as complete
 * Action Type: complete_workflow_planning
 *
 * Transitions from IDLE to STAGE_RUNNING
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { usePipelineStore } from '../../store/usePipelineStore';

export class CompleteWorkflowPlanningAction extends ActionBase {
  /**
   * Handle complete_workflow_planning action
   *
   * @param step - Execution step containing:
   *   - total_stages: Total number of stages planned
   */
  execute(step: ExecutionStep): void {
    const { total_stages } = step;

    const state = usePipelineStore.getState();

    console.log(
      `[CompleteWorkflowPlanningAction] Workflow planning complete with ${total_stages} stages`
    );

    // Mark workflow as planned
    state.state.FSM.workflow_planned = true;

    // If FSM is in IDLE state, prepare to transition to first stage
    if (state.state.FSM.state === 'IDLE') {
      const plannedStages = state.observation.location.progress.stages.planned || [];

      if (plannedStages.length > 0) {
        // Set current stage to the first planned stage
        state.observation.location.current.stage_id = plannedStages[0].stage_id;

        // Transition to STAGE_RUNNING
        state.state.FSM.state = 'STAGE_RUNNING';

        console.log(
          `[CompleteWorkflowPlanningAction] ✅ Transitioned to STAGE_RUNNING, current stage: ${plannedStages[0].stage_id}`
        );
      } else {
        console.warn('[CompleteWorkflowPlanningAction] No stages planned, cannot transition');
      }
    }

    // Update pipeline store
    usePipelineStore.setState(state);
  }
}

// Register action
registerAction('complete_workflow_planning', CompleteWorkflowPlanningAction);
