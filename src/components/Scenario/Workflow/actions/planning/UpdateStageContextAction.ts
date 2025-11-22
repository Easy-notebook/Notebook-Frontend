/**
 * UpdateStageContextAction - Updates context information for a stage
 * Action Type: update_stage_context
 *
 * Optional action to provide additional context during stage planning
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { usePipelineStore } from '../../store/usePipelineStore';

export class UpdateStageContextAction extends ActionBase {
  /**
   * Handle update_stage_context action - add context info to a stage
   *
   * @param step - Execution step containing:
   *   - stage_id: Stage identifier
   *   - focus: Focus areas for the stage
   *   - notes: Additional notes
   */
  execute(step: ExecutionStep): void {
    const { stage_id, focus, notes } = step;

    if (!stage_id) {
      console.error('[UpdateStageContextAction] Missing stage_id:', step);
      return;
    }

    const pipelineStore = usePipelineStore.getState();
    const observation = pipelineStore.observation;

    // Find the stage
    const stage = observation.location.progress.stages.planned?.find(
      (s: any) => s.stage_id === stage_id
    );

    if (!stage) {
      console.warn(`[UpdateStageContextAction] Stage not found: ${stage_id}`);
      return;
    }

    // Update context
    if (focus !== undefined) {
      stage.focus = focus;
    }
    if (notes !== undefined) {
      stage.notes = notes;
    }

    console.log(`[UpdateStageContextAction] ✅ Updated context for stage: ${stage_id}`);

    // Update pipeline store
    usePipelineStore.setState({ observation });
  }
}

// Register action
registerAction('update_stage_context', UpdateStageContextAction);
