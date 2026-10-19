export type StreamOutcome = 'completed' | 'cancelled' | 'failed';
type ActionPhase = 'received' | 'running' | StreamOutcome | 'deferred';

interface ActionTrace {
  actionIndex: number;
  actionType: string;
  phase: ActionPhase;
  receivedAt: number;
  executionStartAt?: number;
  executionEndAt?: number;
  error?: string;
}

/** One invocation owns one trace; terminal traces cannot accept late updates. */
export class WorkflowStreamTrace {
  private phase: 'running' | StreamOutcome = 'running';
  private readonly startTime = Date.now();
  private endTime?: number;
  private readonly actions: ActionTrace[] = [];

  constructor(readonly apiType: string) {}

  actionReceived(actionIndex: number, actionType: string): void {
    if (this.phase !== 'running') return;
    this.actions.push({ actionIndex, actionType, phase: 'received', receivedAt: Date.now() });
  }

  actionExecutionStart(index: number): void {
    const action = this.actions[index];
    if (this.phase !== 'running' || action?.phase !== 'received') return;
    action.phase = 'running';
    action.executionStartAt = Date.now();
  }

  actionExecutionEnd(index: number, error?: string): void {
    const action = this.actions[index];
    if (this.phase !== 'running' || action?.phase !== 'running') return;
    action.phase = error === undefined ? 'completed' : 'failed';
    action.executionEndAt = Date.now();
    action.error = error;
  }

  actionDeferred(index: number): void {
    const action = this.actions[index];
    if (this.phase === 'running' && action?.phase === 'received') action.phase = 'deferred';
  }

  finish(outcome: StreamOutcome): void {
    if (this.phase !== 'running') return;
    this.phase = outcome;
    this.endTime = Date.now();
    for (const action of this.actions) {
      if (action.phase === 'running' || action.phase === 'received') {
        action.phase = outcome === 'completed' ? 'deferred' : outcome;
        if (action.executionStartAt !== undefined) action.executionEndAt = this.endTime;
      }
    }
  }

  snapshot() {
    return {
      apiType: this.apiType,
      phase: this.phase,
      startTime: this.startTime,
      endTime: this.endTime,
      actions: this.actions.map((action) => ({ ...action })),
    };
  }

  printReport(): void {
    console.log('[WorkflowStreamTrace]', this.snapshot());
  }
}
