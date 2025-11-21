/** Reflecting API Handler - Calls VDSAgents /reflecting endpoint */
import { BaseAPIHandler } from './BaseAPIHandler';
import { StateJSON } from '../types/StateJSON';

export class ReflectingAPIHandler extends BaseAPIHandler {
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
    console.log(`[ReflectingAPI] Calling (stage=${stageId}, step=${stepId}, stream=${stream})`);

    try {
      let actionCount = 0;

      // Call WorkflowAPIClient's callReflectingAPI method
      const iterator = this.apiClient.callReflectingAPI(stateData as StateJSON);

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
