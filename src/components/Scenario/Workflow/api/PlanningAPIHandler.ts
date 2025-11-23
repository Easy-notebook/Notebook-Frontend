/** Planning API Handler - Calls VDSAgents /planning endpoint (Streaming) */
import { BaseAPIHandler } from './BaseAPIHandler';
import { StateJSON } from '@Store/models';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class PlanningAPIHandler extends BaseAPIHandler {
  /**
   * Call Planning API with streaming action support
   *
   * Returns async generator that yields actions as they arrive.
   * Actions are NOT executed here - they will be executed by AsyncStateMachineAdapter
   * to maintain consistency with GeneratingAPIHandler and ReflectingAPIHandler.
   */
  async *call(
    stateData: Record<string, any>,
    stageId?: string,
    stepId?: string,
    _kwargs?: Record<string, any>
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

    try {
      let actionCount = 0;

      // Call WorkflowAPIClient's streaming callPlanningAPI method
      const actionStream = this.apiClient.callPlanningAPI(stateData as StateJSON);

      // Stream actions without executing them
      // Execution will be handled by AsyncStateMachineAdapter for consistency
      for await (const actionData of actionStream) {
        // Extract action object (format: {"action": {...}})
        const action = actionData.action;
        if (!action || !action.type) {
          continue;
        }

        actionCount++;
        console.log(`[PlanningAPI] Action ${actionCount}: ${action.type || 'unknown'}`);

        // Yield action for execution by AsyncStateMachineAdapter
        yield action;
      }

      console.log(`[PlanningAPI] ✅ Planning stream completed: ${actionCount} actions`);
    } catch (error) {
      console.error(`[PlanningAPI] Failed:`, error);
      throw error;
    }
  }
}
