/** Generating API Handler - Calls VDSAgents /generating endpoint */
import { BaseAPIHandler } from './BaseAPIHandler';
import { StateJSON } from '@Store/models';
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';

export class GeneratingAPIHandler extends BaseAPIHandler {
  async *call(
    stateData: Record<string, any>,
    stageId?: string,
    stepId?: string,
    kwargs?: Record<string, any>
  ): AsyncIterableIterator<any> {
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

    console.log('[GeneratingAPI] Injected latest notebook data:', {
      notebook_id: latestNotebook.notebook_id,
      cell_count: latestNotebook.cell_count,
      title: latestNotebook.title,
    });

    const stream = kwargs?.stream ?? true;
    console.log(`[GeneratingAPI] Calling (stage=${stageId}, step=${stepId}, stream=${stream})`);

    try {
      let actionCount = 0;

      // Call WorkflowAPIClient's callGeneratingAPI method
      const iterator = this.apiClient.callGeneratingAPI(stateData as StateJSON);

      for await (const action of iterator) {
        actionCount++;
        console.log(`[GeneratingAPI] Action ${actionCount}: ${action.type || 'unknown'}`);
        yield action;
      }

      console.log(`[GeneratingAPI] Completed ${actionCount} actions`);
    } catch (error) {
      console.error(`[GeneratingAPI] Failed:`, error);
      throw error;
    }
  }
}
