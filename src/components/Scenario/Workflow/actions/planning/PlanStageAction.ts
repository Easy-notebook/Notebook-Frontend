/**
 * PlanStageAction - Creates or updates a stage in the workflow plan
 * Action Type: plan_stage
 *
 * Used during IDLE state to build workflow-level plan
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { usePipelineStore } from '../../store/usePipelineStore';

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
    const { stage_id, title, task, acceptance } = step;

    if (!stage_id || !title || !task || !acceptance) {
      console.error('[PlanStageAction] Missing required fields:', step);
      return;
    }

    const pipelineStore = usePipelineStore.getState();
    const observation = pipelineStore.observation;

    // Initialize planned stages array if not exists
    if (!observation.location.progress.stages.planned) {
      observation.location.progress.stages.planned = [];
    }

    // Check if stage already exists
    const existingIndex = observation.location.progress.stages.planned.findIndex(
      (s: any) => s.stage_id === stage_id
    );

    const stageData = {
      stage_id,
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
      console.log(`[PlanStageAction] ✅ Updated stage: ${stage_id}`);
    } else {
      // Add new stage
      observation.location.progress.stages.planned.push(stageData);
      console.log(`[PlanStageAction] ✅ Added new stage: ${stage_id}`);
    }

    // Update pipeline store
    usePipelineStore.setState({ observation });
  }
}

// Register action
registerAction('plan_stage', PlanStageAction);
