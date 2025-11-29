/** Reflecting API Handler - Calls VDSAgents /reflecting endpoint */
import { BaseAPIHandler } from './BaseAPIHandler';
import { WorkflowState } from '../observation/WorkflowState';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class ReflectingAPIHandler extends BaseAPIHandler {
  async *call(
    state: WorkflowState,
    stageId?: string,
    stepId?: string,
    kwargs?: Record<string, any>
  ): AsyncIterableIterator<any> {
    if (!stageId || !stepId) {
      [stageId, stepId] = this.extractLocationInfo(state);
    }

    // Get latest notebook state directly from notebookStore
    const latestNotebook = globalUpdateInterface.getNotebookState();

    // Update state with latest notebook data
    state.state.notebook.update(latestNotebook);

    console.log('[ReflectingAPI] Injected latest notebook data:', {
      notebook_id: latestNotebook.notebook_id,
      cell_count: latestNotebook.cell_count,
      title: latestNotebook.title,
    });

    const stream = kwargs?.stream ?? true;
    console.log(`[ReflectingAPI] Calling (stage=${stageId}, step=${stepId}, stream=${stream})`);

    try {
      let actionCount = 0;

      // Call WorkflowAPIClient's callReflectingAPI method
      const iterator = this.apiClient.callReflectingAPI(state.toJSON());

      for await (const action of iterator) {
        actionCount++;
        console.log(`[ReflectingAPI] Action ${actionCount}: ${action.type || 'unknown'}`);
        yield action;
      }

      console.log(`[ReflectingAPI] Completed ${actionCount} actions`);
    } catch (error) {
      console.error(`[ReflectingAPI] Failed:`, error);
      throw error;
    }
  }
}
