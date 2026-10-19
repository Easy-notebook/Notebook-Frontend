import useNotebookStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { WorkflowState } from '../observation/WorkflowState';
import { useAIPlanningContextStore } from './aiPlanningContext';

/** Owns the notebook-facing effects of one code execution, including delayed debug focus. */
export class ScriptCodeExecution {
  private phase: 'executing' | 'publishing' | 'waiting-focus' | 'settled' = 'executing';
  private owner = useNotebookStore.getState().notebookId;
  private unsubscribe = () => {};
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly cellId: string,
    private readonly signal?: AbortSignal
  ) {}

  private readonly abort = () => this.settle();

  private owns(): boolean {
    const notebook = useNotebookStore.getState();
    return (
      this.phase !== 'settled' &&
      !this.signal?.aborted &&
      notebook.notebookId === this.owner &&
      notebook.cells.some((cell) => cell.id === this.cellId)
    );
  }

  private settle(): void {
    if (this.phase === 'settled') return;
    this.phase = 'settled';
    this.unsubscribe();
    this.signal?.removeEventListener('abort', this.abort);
    if (this.timer !== undefined) clearTimeout(this.timer);
  }

  async run(needOutput: boolean, autoDebug: boolean) {
    this.signal?.throwIfAborted();
    if (!this.cellId || !this.owns()) return false;
    this.unsubscribe = useNotebookStore.subscribe((notebook) => {
      // Kernel initialization may assign an ID to a new, unsaved notebook.
      if (this.phase === 'executing' && this.owner === null && notebook.notebookId !== null)
        this.owner = notebook.notebookId;
      if (!this.owns()) this.settle();
    });
    this.signal?.addEventListener('abort', this.abort, { once: true });
    try {
      const code = useCodeStore.getState();
      if (needOutput) code.setCellMode(this.cellId, 'output_only');
      if (!this.owns()) return false;
      const result = await code.executeCell(this.cellId);
      this.signal?.throwIfAborted();
      if (!this.owns()) return false;
      this.phase = 'publishing';
      const { useWorkflowStateMachine } = await import('./workflowStateMachine');
      this.signal?.throwIfAborted();
      if (!this.owns()) return false;

      const cell = useNotebookStore.getState().cells.find((item) => item.id === this.cellId);
      const outputs = result.outputs?.length
        ? result.outputs
        : !result.success
          ? cell?.outputs || []
          : [];
      if (outputs.length) {
        const machine = useWorkflowStateMachine.getState();
        const state = new WorkflowState(structuredClone(machine.stateJSON));
        const messages: string[] = [];
        for (const item of outputs) {
          const content = item.content || item.text || item.toString();
          messages.push(content);
          state.state.effects.addCurrentEffect(
            item.type === 'error'
              ? {
                  type: 'error',
                  error: { name: 'ExecutionError', message: content, traceback: [] },
                  cell_ref: this.cellId,
                }
              : item.type === 'image'
                ? { type: 'image_url', image_url: content, cell_ref: this.cellId }
                : { type: 'text', text: content, cell_ref: this.cellId }
          );
        }
        machine.setState(state.toJSON());
        if (!this.owns()) return false;
        const context = useAIPlanningContextStore.getState();
        context.setEffect({ ...context.effect, current: [...context.effect.current, ...messages] });
        if (!this.owns()) return false;
      }

      if (autoDebug && !result.success) {
        this.phase = 'waiting-focus';
        this.timer = setTimeout(() => {
          try {
            if (this.owns()) useNotebookStore.getState().setCurrentCell(this.cellId);
          } finally {
            this.settle();
          }
        }, 1000);
      }
      return result.success ? result.outputs : result.error;
    } catch (error) {
      this.signal?.throwIfAborted();
      if (this.owns()) console.error(`[ScriptStore] Error executing cell ${this.cellId}:`, error);
      return false;
    } finally {
      if (this.phase !== 'waiting-focus') this.settle();
    }
  }
}
