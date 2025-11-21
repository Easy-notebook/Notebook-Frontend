/**
 * START_BEHAVIOR Event Handler
 * Handles behavior initialization from planning API.
 * Event: START_BEHAVIOR
 * Transition: STEP_RUNNING → BEHAVIOR_RUNNING
 *
 * Ported from: ref/Notebook-BCC/core/transition_handlers/START_BEHAVIOR_handler.py
 */

import { BaseTransitionHandler } from './BaseTransitionHandler';

export class StartBehaviorHandler extends BaseTransitionHandler {
  constructor() {
    super('STEP_RUNNING', 'BEHAVIOR_RUNNING', 'START_BEHAVIOR');
  }

  canHandle(apiResponse: any): boolean {
    if (typeof apiResponse !== 'object' || apiResponse === null) {
      return false;
    }

    // Check for behavior fields
    const hasBehaviorId = 'behavior_id' in apiResponse;
    const hasAgent = 'agent' in apiResponse;
    const hasTask = 'task' in apiResponse;
    const hasTitle = 'title' in apiResponse;

    // Accept if has behavior_id and either (agent, task, or title)
    // Title can be used as task description
    return hasBehaviorId && (hasAgent || hasTask || hasTitle);
  }

  apply(state: Record<string, any>, apiResponse: any): Record<string, any> {
    const newState = this.deepCopyState(state);

    // Extract behavior fields
    const behaviorId = apiResponse.behavior_id;
    const stepId = apiResponse.step_id || state.observation?.location?.current?.step_id;
    const agent = apiResponse.agent || 'default_agent';
    // Use task if available, otherwise use title, otherwise use focus
    const task = (apiResponse.task || apiResponse.title || apiResponse.focus || '').trim();
    const inputs = apiResponse.inputs || {};
    const outputs = apiResponse.outputs || {};
    const acceptance = apiResponse.acceptance || [];
    const whathappened = apiResponse.whathappened || {};

    console.log(`[StartBehavior] Applying behavior: ${behaviorId}`);
    console.log(`[StartBehavior] Task/Title: ${task}`);

    // Get structures
    const progress = this.getProgress(newState);
    if (!progress.behaviors) {
      progress.behaviors = {};
    }
    const behaviorsProgress = progress.behaviors;
    const location = this.getLocation(newState);

    // Build current behavior
    const currentBehavior: Record<string, any> = {
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
    behaviorsProgress.current = currentBehavior;
    behaviorsProgress.completed = [];
    behaviorsProgress.iteration = 1;
    behaviorsProgress.focus = task;

    // Initialize outputs tracking
    const expectedOutputs = Object.entries(outputs).map(([name, description]) => ({
      name,
      description: String(description),
    }));

    behaviorsProgress.current_outputs = {
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
      location.goals = task;
    }

    // Update FSM state
    this.updateFSMState(newState, 'BEHAVIOR_RUNNING', 'START_BEHAVIOR');

    console.log(`[StartBehavior] Transition complete: behavior=${behaviorId}`);

    return newState;
  }
}
