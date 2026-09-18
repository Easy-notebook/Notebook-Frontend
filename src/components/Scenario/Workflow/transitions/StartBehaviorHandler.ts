/**
 * START_BEHAVIOR Event Handler
 * Handles behavior initialization from planning API.
 * Event: START_BEHAVIOR
 * Transition: STEP_RUNNING → BEHAVIOR_RUNNING
 *
 * Ported from: ref/Notebook-BCC/core/transition_handlers/START_BEHAVIOR_handler.py
 */

import { BaseTransitionHandler } from './BaseTransitionHandler';
import { WorkflowState as WorkflowStateEnum, WorkflowEvent } from '@Store/models';
import { WorkflowState } from '../observation/WorkflowState';

export class StartBehaviorHandler extends BaseTransitionHandler {
  constructor() {
    super(
      WorkflowStateEnum.STEP_RUNNING,
      WorkflowStateEnum.BEHAVIOR_RUNNING,
      WorkflowEvent.START_BEHAVIOR
    );
  }

  canHandle(apiResponse: any): boolean {
    if (typeof apiResponse !== 'object' || apiResponse === null) {
      return false;
    }

    // Legacy format: direct behavior object
    if ('behavior_id' in apiResponse) {
      return true;
    }

    // Streaming format: actions array
    if ('actions' in apiResponse && Array.isArray(apiResponse.actions)) {
      return apiResponse.actions.some(
        (a: any) =>
          a.type === 'plan_behavior' ||
          a.type === 'start_behavior' ||
          a.type === 'complete_step_planning' // This might be the trigger
      );
    }

    return false;
  }

  async apply(state: WorkflowState, apiResponse: any): Promise<WorkflowState> {
    const newState = this.deepCopyState(state);
    let data = apiResponse;

    // Extract behavior from actions if streaming
    if ('actions' in apiResponse && Array.isArray(apiResponse.actions)) {
      console.log('[StartBehavior] Extracting behavior from streaming actions');
      // Include delegate_task as it contains agent and task info
      const behaviorAction = apiResponse.actions.find(
        (a: any) =>
          a.type === 'plan_behavior' || a.type === 'start_behavior' || a.type === 'delegate_task'
      );

      if (behaviorAction) {
        data = behaviorAction;
        console.log(`[StartBehavior] Found behavior action: ${behaviorAction.type}`);
      } else {
        // If no explicit behavior action, check if we have enough info in the response or other actions
        // Sometimes complete_step_planning implies starting the first behavior?
        // For now, warn if not found
        console.warn('[StartBehavior] No behavior action found in streaming response');
      }
    }

    // Extract behavior fields
    const behaviorId = data.behavior_id || data.behaviorId;
    const stepId = data.step_id || data.stepId || state.location.current.stepId;
    // FIX: Also check state for agent set by DelegateTaskAction, fallback to 'default_agent' only as last resort
    const existingBehavior = state.location.current.behavior as { agent?: string } | undefined;
    const agent = data.agent || existingBehavior?.agent || 'default_agent';
    // Use task if available (including task_description from delegate_task), otherwise use title, otherwise use focus
    const task = (data.task || data.task_description || data.title || data.focus || '').trim();
    const inputs = data.inputs || {};
    const outputs = data.outputs || {};
    const acceptance = data.acceptance || [];
    const whathappened = data.whathappened || {};

    console.log(`[StartBehavior] Applying behavior: ${behaviorId}`);
    console.log(`[StartBehavior] Agent: ${agent}`);
    console.log(`[StartBehavior] Task/Title: ${task}`);

    // Get structures
    const progress = newState.location.progress;

    // Build current behavior
    const currentBehavior: any = {
      behavior_id: behaviorId,
      step_id: stepId,
      agent,
      task,
      inputs,
      outputs,
      acceptance,
    };

    if (whathappened && Object.keys(whathappened).length > 0) {
      currentBehavior.whathappened = whathappened;
    }

    // Update behaviors progress
    progress.updateBehaviorCurrent(currentBehavior);
    progress.behaviors.completed = [];
    progress.setBehaviorIteration(1);
    progress.setBehaviorFocus(task);

    // Initialize outputs tracking
    const expectedOutputs = Object.entries(outputs).map(([name, description]) => ({
      name,
      description: String(description),
    }));

    progress.behaviors.current_outputs = {
      expected: expectedOutputs,
      produced: [],
      in_progress: [],
    };

    // Update location.current
    this.updateLocationCurrent(newState, {
      behavior_id: behaviorId,
      behavior_iteration: 1,
    });

    // Update location.goals
    if (task) {
      newState.location.setGoals(task);
    }

    // Update FSM state
    this.updateFSMState(newState, WorkflowStateEnum.BEHAVIOR_RUNNING, WorkflowEvent.START_BEHAVIOR);

    console.log(`[StartBehavior] Transition complete: behavior=${behaviorId}`);

    return newState;
  }
}
