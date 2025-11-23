/**
 * START_WORKFLOW Event Handler
 * Transition: IDLE → STAGE_RUNNING
 * Ported from: ref/Notebook-BCC/core/transition_handlers/start_workflow_handler.py
 */

import { BaseTransitionHandler } from './BaseTransitionHandler';

export class StartWorkflowHandler extends BaseTransitionHandler {
  constructor() {
    super('IDLE', 'STAGE_RUNNING', 'START_WORKFLOW');
  }

  canHandle(apiResponse: any): boolean {
    // Planning API in IDLE state returns actions with plan_stage and complete_workflow_planning
    if (typeof apiResponse !== 'object' || apiResponse === null) {
      return false;
    }

    // Check for streaming planning API format (actions array)
    if ('actions' in apiResponse && Array.isArray(apiResponse.actions)) {
      const actions = apiResponse.actions;
      // Look for plan_stage or complete_workflow_planning actions
      for (const action of actions) {
        if (typeof action === 'object' && action !== null) {
          const actionType = action.type || '';
          if (actionType === 'plan_stage' || actionType === 'complete_workflow_planning') {
            console.log(
              '[StartWorkflow] canHandle: Found planning actions, this is IDLE → planning API'
            );
            return true;
          }
        }
      }
    }

    // Legacy format: stages array (kept for backwards compatibility)
    if ('stages' in apiResponse && Array.isArray(apiResponse.stages)) {
      console.log('[StartWorkflow] canHandle: Found stages array (legacy format)');
      return true;
    }

    return false;
  }

  apply(state: Record<string, any>, apiResponse: any): Record<string, any> {
    console.log('[StartWorkflow] ============================================');
    console.log('[StartWorkflow] APPLY METHOD CALLED');
    console.log('[StartWorkflow] ============================================');

    const newState = this.deepCopyState(state);

    // Check if using streaming actions format (new) or stages array format (legacy)
    const isStreamingFormat = 'actions' in apiResponse && Array.isArray(apiResponse.actions);

    if (isStreamingFormat) {
      // Streaming format: actions have already been executed by AsyncStateMachineAdapter
      // including complete_workflow_planning which set the state to STAGE_RUNNING
      console.log('[StartWorkflow] Using streaming format - actions already executed');
      console.log('[StartWorkflow] Current FSM state:', newState.state.FSM.state);
      console.log(
        '[StartWorkflow] Current stage_id:',
        newState.observation.location.current.stage_id
      );

      // Verify the state was set correctly by complete_workflow_planning action
      const plannedStages = newState.observation.location.progress.stages?.planned || [];
      console.log(`[StartWorkflow] Found ${plannedStages.length} planned stages`);

      // Ensure FSM state is STAGE_RUNNING (should already be set by complete_workflow_planning)
      if (newState.state.FSM.state !== 'STAGE_RUNNING') {
        console.warn('[StartWorkflow] FSM state is not STAGE_RUNNING, correcting...');
        this.updateFSMState(newState, 'STAGE_RUNNING', 'START_WORKFLOW');
      }

      this.syncNotebookToState(newState);
      return newState;
    }

    // Legacy format: stages array - process as before
    console.log('[StartWorkflow] Using legacy stages array format');
    const stagesData = apiResponse.stages || [];
    const focus = apiResponse.focus || '';
    const title = apiResponse.title || '';
    const description = apiResponse.description || '';

    console.log(`[StartWorkflow] Applying ${stagesData.length} stages`);
    console.log(`[StartWorkflow] Title: "${title}"`);
    console.log(`[StartWorkflow] Description: "${description}"`);

    if (!stagesData.length) {
      console.warn('[StartWorkflow] No stages in planning response');
      return newState;
    }

    const progress = this.getProgress(newState);
    if (!progress.stages) progress.stages = {};
    const stagesProgress = progress.stages;

    const firstStage = stagesData[0];
    stagesProgress.current = {
      stage_id: firstStage.stage_id,
      title: firstStage.title || '',
      goal: firstStage.goal || '',
      verified_artifacts: firstStage.verified_artifacts || {},
    };
    stagesProgress.completed = [];
    stagesProgress.focus = focus;
    stagesProgress.remaining = stagesData.slice(1);
    stagesProgress.current_outputs = this.initOutputsTracking(firstStage.verified_artifacts || {});

    this.updateLocationCurrent(newState, {
      stage_id: firstStage.stage_id,
      step_id: 'clear',
      behavior_id: 'clear',
    });

    this.updateFSMState(newState, 'STAGE_RUNNING', 'START_WORKFLOW');

    // Update notebook metadata title (matches backend: line 108-112)
    console.log('[StartWorkflow] ========== EXECUTING ACTIONS ==========');
    if (title) {
      console.log('[StartWorkflow] ACTION 1: update_title with title:', title);
      this.executeAction('update_title', title);
    } else if (focus) {
      // Fallback to focus if no title provided
      console.log('[StartWorkflow] ACTION 1: update_title with focus:', focus);
      this.executeAction('update_title', focus);
    }

    // Execute description as plain markdown text (matches backend: line 115-116)
    if (description) {
      console.log(
        '[StartWorkflow] ACTION 2: add-text with description:',
        description.substring(0, 100)
      );
      this.executeAction('add-text', description, { shotType: 'markdown' });
    }

    // Execute new_section action - will add "### {title}" markdown automatically (matches backend: line 119-121)
    const firstStageTitle = firstStage.title || '';
    if (firstStageTitle) {
      console.log('[StartWorkflow] ACTION 3: new_section with firstStageTitle:', firstStageTitle);
      this.executeAction('new_section', firstStageTitle);
    }
    console.log('[StartWorkflow] ========== ACTIONS DISPATCHED ==========');

    // Note: Stages data is already stored in newState.observation.location.progress.stages
    // UI components should read directly from stateJSON instead of a separate store

    this.syncNotebookToState(newState);
    return newState;
  }

  /**
   * REMOVED: syncWorkflowTemplate
   *
   * Previously synced to usePipelineStore (now deprecated).
   * UI components should read directly from stateJSON.observation.location.progress.stages
   * instead of using a separate workflowTemplate store.
   */
}
