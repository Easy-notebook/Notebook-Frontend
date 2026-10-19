import type { StateJSON } from '@Store/models';

interface Ports {
  snapshot(): StateJSON;
  notebookId(): string | null;
  watch(check: () => void): () => void;
  apply(
    snapshot: StateJSON,
    response: Record<string, unknown>,
    apiType: string | undefined,
    signal: AbortSignal
  ): Promise<StateJSON>;
  fail(error: unknown): void;
}

/** A direct transition owns its input snapshot until a control or notebook change replaces it. */
export class WorkflowTransitionSession {
  constructor(private readonly ports: Ports) {}

  async run(
    response: Record<string, unknown>,
    apiType: string | undefined,
    publish: (next: StateJSON, previous: StateJSON) => void
  ): Promise<void> {
    const previous = this.ports.snapshot();
    const notebookId = this.ports.notebookId();
    const controller = new AbortController();
    const owns = () =>
      !controller.signal.aborted &&
      this.ports.snapshot() === previous &&
      this.ports.notebookId() === notebookId;
    let released = false;
    let unsubscribe: (() => void) | undefined;
    const release = () => {
      if (released) return;
      released = true;
      unsubscribe?.();
    };
    unsubscribe = this.ports.watch(() => {
      if (!owns()) {
        controller.abort(new DOMException('Transition context changed', 'AbortError'));
        release();
      }
    });
    if (released) unsubscribe();
    try {
      if (!owns()) return;
      const next = await this.ports.apply(
        structuredClone(previous),
        structuredClone(response),
        apiType,
        controller.signal
      );
      if (owns()) {
        release();
        if (owns()) publish(next, previous);
      }
    } catch (error) {
      if (owns()) this.ports.fail(error);
    } finally {
      release();
    }
  }
}
