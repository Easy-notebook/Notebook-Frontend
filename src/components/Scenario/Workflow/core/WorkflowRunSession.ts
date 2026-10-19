import { WorkflowState, type StateJSON } from '@Store/models';

type Step = (snapshot: StateJSON, signal: AbortSignal) => Promise<[StateJSON, string | null]>;
interface Ports {
  notebookId(): string | null;
  watch(check: () => void): () => void;
  prepare(signal: AbortSignal): Promise<Step>;
  publish(snapshot: StateJSON): void;
  busy(value: boolean): void;
  fail(error: unknown): void;
  limit: number;
}
interface Run {
  phase: 'preparing' | 'running' | 'settled';
  owner: string | null;
  controller: AbortController;
  unsubscribe: () => void;
  resolve: () => void;
}
const terminal = new Set([
  WorkflowState.FAILED,
  WorkflowState.COMPLETE,
  WorkflowState.CANCELED,
  WorkflowState.PAUSED,
]);

/** One local automatic loop; only the current run can publish or release its busy flag. */
export class WorkflowRunSession {
  private current?: Run;
  constructor(private readonly ports: Ports) {}

  start(snapshot: StateJSON): Promise<void> {
    const input = structuredClone(snapshot);
    this.stop();
    let resolve!: () => void;
    const completion = new Promise<void>((done) => {
      resolve = done;
    });
    const run: Run = {
      phase: 'preparing',
      owner: this.ports.notebookId(),
      controller: new AbortController(),
      unsubscribe: () => {},
      resolve,
    };
    this.current = run;
    run.unsubscribe = this.ports.watch(() => {
      if (this.current === run && this.ports.notebookId() !== run.owner) this.finish(run);
    });
    void this.execute(run, input);
    return completion;
  }

  stop(): void {
    if (this.current) this.finish(this.current);
  }

  private owns(run: Run): boolean {
    return this.current === run && run.phase !== 'settled' && this.ports.notebookId() === run.owner;
  }

  private finish(run: Run): void {
    if (this.current !== run || run.phase === 'settled') return;
    run.phase = 'settled';
    this.current = undefined;
    run.unsubscribe();
    this.ports.busy(false);
    run.controller.abort();
    run.resolve();
  }

  private async execute(run: Run, snapshot: StateJSON): Promise<void> {
    try {
      this.ports.publish(snapshot);
      if (!this.owns(run)) return;
      this.ports.busy(true);
      if (!this.owns(run)) return;
      const step = await this.ports.prepare(run.controller.signal);
      if (!this.owns(run)) return;
      run.phase = 'running';
      for (let iteration = 0; iteration < this.ports.limit; iteration++) {
        if (!this.owns(run) || terminal.has(snapshot.state.FSM.state)) return;
        const [next, transition] = await step(structuredClone(snapshot), run.controller.signal);
        if (!this.owns(run)) return;
        snapshot = next;
        this.ports.publish(snapshot);
        if (!transition) return;
      }
    } catch (error) {
      if (this.owns(run)) this.ports.fail(error);
    } finally {
      this.finish(run);
    }
  }
}
