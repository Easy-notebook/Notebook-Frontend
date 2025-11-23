/**
 * Base API Handler
 * Ported from: ref/Notebook-BCC/core/api_handlers/base_api_handler.py
 */

export abstract class BaseAPIHandler {
  protected apiClient: any;
  protected scriptStore?: any;
  protected name: string;

  constructor(apiClient: any, scriptStore?: any, name?: string) {
    this.apiClient = apiClient;
    this.scriptStore = scriptStore;
    this.name = name || this.constructor.name;
  }

  abstract call(
    stateData: Record<string, any>,
    stageId: string,
    stepId: string,
    kwargs?: Record<string, any>
  ): Promise<any> | AsyncIterableIterator<any>;

  protected extractLocationInfo(stateData: Record<string, any>): [string, string] {
    const observation = stateData.observation || {};
    const location = observation.location || {};
    const current = location.current || {};

    const stageId = current.stage_id || 'unknown';
    const stepId = current.step_id || 'none';

    return [stageId, stepId];
  }
}
