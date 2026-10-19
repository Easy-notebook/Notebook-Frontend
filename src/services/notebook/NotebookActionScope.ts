import useNotebookStore from '@Store/notebookStore';

/** One action's notebook ownership, from lazy admission through execution. */
export class NotebookActionScope {
  private phase: 'admitting' | 'executing' | 'settled' = 'admitting';
  private owner = useNotebookStore.getState().notebookId;
  private readonly controller = new AbortController();
  private readonly unsubscribe: () => void;
  private readonly onAbort = () => this.dispose();
  readonly signal: AbortSignal;

  constructor(signal?: AbortSignal) {
    this.signal = signal
      ? AbortSignal.any([signal, this.controller.signal])
      : this.controller.signal;
    this.unsubscribe = useNotebookStore.subscribe((notebook) => {
      // Execution may initialize the kernel and assign an unsaved notebook its first ID.
      if (this.phase === 'executing' && this.owner === null && notebook.notebookId !== null)
        this.owner = notebook.notebookId;
      if (notebook.notebookId !== this.owner) {
        this.controller.abort(new DOMException('Action notebook context changed', 'AbortError'));
      }
    });
    this.signal.addEventListener('abort', this.onAbort, { once: true });
    if (this.signal.aborted) this.dispose();
  }

  begin(): void {
    this.signal.throwIfAborted();
    this.phase = 'executing';
  }

  dispose(): void {
    if (this.phase === 'settled') return;
    this.phase = 'settled';
    this.unsubscribe();
    this.signal.removeEventListener('abort', this.onAbort);
  }
}
