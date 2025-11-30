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

    // Log detailed notebook and effects info for debugging
    console.log('[ReflectingAPI] Injected latest notebook data:', {
      notebook_id: latestNotebook.notebook_id,
      cell_count: latestNotebook.cell_count,
      title: latestNotebook.title,
    });

    // Log cells with outputs for debugging
    if (latestNotebook.cells) {
      const codeCells = latestNotebook.cells.filter((c: any) => c.type === 'code');
      console.log(
        '[ReflectingAPI] Code cells with outputs:',
        codeCells.map((c: any) => ({
          id: c.id,
          content_preview: c.content?.substring(0, 50),
          outputs_count: c.outputs?.length || 0,
          outputs: c.outputs,
        }))
      );
    }

    // Log effects
    const effects = state.state.effects;
    console.log('[ReflectingAPI] Current effects:', {
      current_count: effects?.current?.length || 0,
      history_count: effects?.history?.length || 0,
      current: effects?.current,
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
