/**
 * UpdateProgressAction - Updates progress information in the observation
 * Action Type: update_progress
 *
 * Updates the progress tracking (stages, steps, behaviors) in the workflow state.
 */

import { ActionBase, registerAction } from '../base';
import type { ExecutionStep } from '@Store/models';
import { useWorkflowStateMachine } from '../../store/workflowStateMachine';

export class UpdateProgressAction extends ActionBase {
  /**
   * Handle update_progress action
   *
   * @param step - Execution step containing:
   *   - type: 'stage' | 'step' | 'behavior'
   *   - id: Identifier of the item to update
   *   - status: 'completed' | 'current' | 'planned'
   *   - data: Data to update (title, goal, verified_artifacts, etc.)
   */
  execute(step: ExecutionStep): void {
    const { type, id, status, data } = step;

    if (!type || !id) {
      console.warn('[UpdateProgressAction] Missing type or id', step);
      return;
    }

    const stateMachine = useWorkflowStateMachine.getState();
    const stateJSON = stateMachine.stateJSON;
    const observation = stateJSON.observation;
    const progress = observation?.location?.progress;

    if (!progress) {
      console.warn('[UpdateProgressAction] Invalid observation structure');
      return;
    }

    let targetCollection: any;

    switch (type) {
      case 'stage':
        targetCollection = progress.stages;
        break;
      case 'step':
        targetCollection = progress.steps;
        break;
      case 'behavior':
        targetCollection = progress.behaviors;
        break;
      default:
        console.warn(`[UpdateProgressAction] Unknown type: ${type}`);
        return;
    }

    if (status === 'current') {
      // Update current item
      if (targetCollection.current) {
        // Merge data
        targetCollection.current = { ...targetCollection.current, ...data };
      } else {
        // Set new current
        targetCollection.current = { ...data };
        // Ensure ID matches if provided in data, otherwise use the passed id
        if (!targetCollection.current[type + '_id']) {
          targetCollection.current[type + '_id'] = id;
        }
      }
    } else if (status === 'completed') {
      // Add to completed list
      if (!targetCollection.completed) {
        targetCollection.completed = [];
      }

      // Check if already exists
      const existingIndex = targetCollection.completed.findIndex(
        (item: any) => item[type + '_id'] === id
      );

      if (existingIndex >= 0) {
        // Update existing
        targetCollection.completed[existingIndex] = {
          ...targetCollection.completed[existingIndex],
          ...data,
        };
      } else {
        // Add new
        const newItem = { ...data };
        if (!newItem[type + '_id']) {
          newItem[type + '_id'] = id;
        }
        targetCollection.completed.push(newItem);
      }
    } else if (status === 'planned') {
      // Update planned list
      if (!targetCollection.planned) {
        targetCollection.planned = [];
      }

      const existingIndex = targetCollection.planned.findIndex(
        (item: any) => item[type + '_id'] === id
      );

      if (existingIndex >= 0) {
        targetCollection.planned[existingIndex] = {
          ...targetCollection.planned[existingIndex],
          ...data,
        };
      } else {
        const newItem = { ...data };
        if (!newItem[type + '_id']) {
          newItem[type + '_id'] = id;
        }
        targetCollection.planned.push(newItem);
      }
    }

    console.log(`[UpdateProgressAction] ✅ Updated progress for ${type} ${id} (${status})`);
    stateMachine.setState(stateJSON);
  }
}

registerAction('update_progress', UpdateProgressAction);
