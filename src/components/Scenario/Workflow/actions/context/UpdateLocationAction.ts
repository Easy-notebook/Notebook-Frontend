/**
 * UpdateLocationAction - Updates location information in the observation
 * Action Type: update_location
 *
 * Updates the current location (stage, step, behavior) in the workflow state.
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class UpdateLocationAction extends ActionBase {
  /**
   * Handle update_location action
   *
   * @param step - Execution step containing:
   *   - stage_id: Stage identifier (optional)
   *   - step_id: Step identifier (optional, 'clear' to remove)
   *   - behavior_id: Behavior identifier (optional, 'clear' to remove)
   *   - behavior_iteration: Iteration count (optional)
   */
  execute(step: ExecutionStep): void {
    const { stage_id, step_id, behavior_id, behavior_iteration } = step;

    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const observation = stateJSON.observation;

    if (!observation?.location?.current) {
      console.warn('[UpdateLocationAction] Invalid observation structure');
      return;
    }

    const current = observation.location.current;
    let changed = false;

    if (stage_id !== undefined) {
      current.stage_id = stage_id;
      changed = true;
    }

    if (step_id !== undefined) {
      current.step_id = step_id === 'clear' ? null : step_id;
      changed = true;
    }

    if (behavior_id !== undefined) {
      current.behavior_id = behavior_id === 'clear' ? null : behavior_id;
      changed = true;
    }

    if (behavior_iteration !== undefined) {
      current.behavior_iteration = behavior_iteration;
      changed = true;
    }

    if (changed) {
      console.log(`[UpdateLocationAction] ✅ Updated location`, {
        stage_id,
        step_id,
        behavior_id,
        behavior_iteration,
      });
      stateMachine.setState(stateJSON);
    }
  }
}

registerAction('update_location', UpdateLocationAction);
