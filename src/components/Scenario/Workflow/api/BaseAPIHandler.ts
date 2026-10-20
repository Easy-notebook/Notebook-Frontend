import type { WorkflowState } from '../observation/WorkflowState';
import type { WorkflowAPIClientPort } from '@Store/models';
/**
 * Base API Handler
 * Ported from: ref/Notebook-BCC/core/api_handlers/base_api_handler.py
 */

export abstract class BaseAPIHandler {
  protected apiClient: WorkflowAPIClientPort;
  protected scriptStore?: any;
  protected name: string;

  constructor(apiClient: WorkflowAPIClientPort, scriptStore?: any, name?: string) {
    this.apiClient = apiClient;
    this.scriptStore = scriptStore;
    this.name = name || this.constructor.name;
  }

  /** Load application state only when requesting data, not while defining FSM states. */
  protected async synchronizeNotebook(state: WorkflowState, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const { default: updates } = await import('@/interfaces/globalUpdateInterface');
    signal?.throwIfAborted();
    const notebook = updates.getNotebookState();
    signal?.throwIfAborted();
    state.state.notebook.update(notebook);
    return notebook;
  }

  abstract call(
    state: any, // Using any to avoid circular dependency, but should be WorkflowState
    stageId: string,
    stepId: string,
    kwargs?: Record<string, any>,
    signal?: AbortSignal
  ): Promise<any> | AsyncIterableIterator<any>;

  protected extractLocationInfo(state: any): [string, string] {
    const current = state.location.current;
    const stageId = current.stageId || 'unknown';
    const stepId = current.stepId || 'none';

    return [stageId, stepId];
  }
}
