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
    return (
      typeof apiResponse === 'object' &&
      'stages' in apiResponse &&
      Array.isArray(apiResponse.stages)
    );
  }

  apply(state: Record<string, any>, apiResponse: any): Record<string, any> {
    console.log('[StartWorkflow] ============================================');
    console.log('[StartWorkflow] APPLY METHOD CALLED');
    console.log('[StartWorkflow] ============================================');
    console.trace('[StartWorkflow] Call stack');

    const newState = this.deepCopyState(state);
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
