/** Planning API Handler - Calls VDSAgents /planning endpoint (Streaming) */
import { BaseAPIHandler } from './BaseAPIHandler';
import { StateJSON } from '@Store/models';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import { getActionClass } from '../actions';

export class PlanningAPIHandler extends BaseAPIHandler {
  /**
   * Call Planning API with streaming action support
   *
   * Returns async generator that yields actions as they arrive
   */
  async *call(
    stateData: Record<string, any>,
    stageId?: string,
    stepId?: string,
    kwargs?: Record<string, any>
  ): AsyncGenerator<any> {
    if (!stageId || !stepId) {
      [stageId, stepId] = this.extractLocationInfo(stateData);
    }

    // Get latest notebook state directly from notebookStore
    const latestNotebook = globalUpdateInterface.getNotebookState();

    // Update stateData with latest notebook data
    stateData.state.notebook = {
      ...stateData.state.notebook,
      ...latestNotebook,
    };

    console.log('[PlanningAPI] Injected latest notebook data:', {
      notebook_id: latestNotebook.notebook_id,
      cell_count: latestNotebook.cell_count,
      title: latestNotebook.title,
    });

    console.log(`[PlanningAPI] Calling (stage=${stageId}, step=${stepId})`);

    try {
      // Call WorkflowAPIClient's streaming callPlanningAPI method
      const actionStream = this.apiClient.callPlanningAPI(stateData as StateJSON);

      // Process each action as it arrives
      for await (const actionData of actionStream) {
        console.log('[PlanningAPI] Received action:', actionData);

        // Extract action object (format: {"action": {...}})
        const action = actionData.action;
        if (!action || !action.type) {
          console.warn('[PlanningAPI] Invalid action format:', actionData);
          continue;
        }

        // Get action handler class
        const ActionClass = getActionClass(action.type);
        if (!ActionClass) {
          console.warn(`[PlanningAPI] Unknown action type: ${action.type}`);
          continue;
        }

        // Execute action
        try {
          const actionInstance = new ActionClass(this.scriptStore);
          await actionInstance.execute(action);
          console.log(`[PlanningAPI] ✅ Executed action: ${action.type}`);
        } catch (error) {
          console.error(`[PlanningAPI] Failed to execute action ${action.type}:`, error);
        }

        // Yield action for external processing if needed
        yield action;
      }

      console.log('[PlanningAPI] ✅ Planning stream completed');
    } catch (error) {
      console.error(`[PlanningAPI] Failed:`, error);
      throw error;
    }
  }
}
