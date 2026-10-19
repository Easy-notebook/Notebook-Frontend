import useNotebookStore from '@Store/notebookStore';
import type { ExecutionResult } from '@Store/models/code';
import { WorkflowState } from '../observation/WorkflowState';
import { ClearEffectCurrentAction } from '../actions/reflecting/ClearEffectCurrent';
import { useWorkflowStateMachine } from './workflowStateMachine';
import { ScriptCodeExecution, scriptCodeResultValue } from './ScriptCodeExecution';

/** Shared repair execution use case for workflow and notebook operation streams. */
export class RepairedCodeExecution {
  constructor(private readonly signal?: AbortSignal) {}

  async run(cellId?: string, notebookId?: string) {
    this.signal?.throwIfAborted();
    const notebook = useNotebookStore.getState();
    if (notebookId !== undefined && notebookId !== notebook.notebookId) return false;
    const target = cellId
      ? notebook.cells.find((cell) => cell.id === cellId && cell.type === 'code')
      : notebook.cells.filter((cell) => cell.type === 'code').pop();
    if (!target) return { success: false, error: 'No code cell found' };

    const execution = new ScriptCodeExecution(target.id, this.signal, (result) =>
      this.recordResult(target.id, result)
    );
    const result = await execution.run(true, false, () => {
      const machine = useWorkflowStateMachine.getState();
      const state = new WorkflowState(structuredClone(machine.stateJSON));
      ClearEffectCurrentAction.processState(state);
      machine.setState(state.toJSON());
    });
    return scriptCodeResultValue(result);
  }

  private recordResult(cellId: string, result: ExecutionResult): void {
    const notebook = useNotebookStore.getState();
    const cell = notebook.cells.find((item) => item.id === cellId);
    if (!cell) return;
    const debug = cell.metadata?.debug || {};
    notebook.updateCellMetadata(cellId, {
      ...cell.metadata,
      debug: {
        ...debug,
        isDebugging: debug.isDebugging ?? true,
        debugStartTime: debug.debugStartTime || new Date().toISOString(),
        errorVersion: debug.errorVersion || '',
        bugAnalysis: debug.bugAnalysis || '',
        executedAfterFix: true,
        executionSuccess: result.success,
      },
    });
  }
}
