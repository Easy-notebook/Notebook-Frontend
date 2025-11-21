/** Generating API Handler - Calls VDSAgents /generating endpoint */
import { BaseAPIHandler } from './BaseAPIHandler';
import { StateJSON } from '../types/StateJSON';

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
