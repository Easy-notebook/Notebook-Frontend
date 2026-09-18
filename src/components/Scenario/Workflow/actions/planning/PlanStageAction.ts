/**
 * PlanStageAction - Creates or updates a stage in the workflow plan
 * Action Type: plan_stage
 *
 * Used during IDLE state to build workflow-level plan
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class PlanStageAction extends ActionBase {
  /**
   * Handle plan_stage action - create or update a stage in the workflow plan
   *
   * @param step - Execution step containing:
   *   - stage_id: Unique identifier for the stage
   *   - title: Stage title
   *   - task: Task description
   *   - acceptance: Acceptance criteria
   */
  execute(step: ExecutionStep): void {
    // Backend sends stage_id, but convertActionToExecutionStep converts it to stageId
    const stageId = (step as any).stageId || (step as any).stage_id;
    const { title, task, acceptance } = step;

    if (!stageId || !title || !task || !acceptance) {
      console.error('[PlanStageAction] Missing required fields:', step);
      return;
    }

    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const observation = stateJSON.observation;

    // Initialize planned stages array if not exists
    if (!observation.location.progress.stages.planned) {
      observation.location.progress.stages.planned = [];
    }

    // Check if stage already exists
    const existingIndex = observation.location.progress.stages.planned.findIndex(
      (s: any) => s.stage_id === stageId
    );

    const stageData = {
      stage_id: stageId,
      title,
      task,
      acceptance,
      planning_complete: false,
    };

    if (existingIndex >= 0) {
      // Update existing stage
      observation.location.progress.stages.planned[existingIndex] = {
        ...observation.location.progress.stages.planned[existingIndex],
        ...stageData,
      };
      console.log(`[PlanStageAction] ✅ Updated stage: ${stageId}`);
    } else {
      // Add new stage
      observation.location.progress.stages.planned.push(stageData);
      console.log(`[PlanStageAction] ✅ Added new stage: ${stageId}`);
    }

    // Update workflow state machine with modified stateJSON
    stateMachine.setState(stateJSON);
  }
}

// Register action
registerAction('plan_stage', PlanStageAction);
