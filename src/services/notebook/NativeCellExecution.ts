import { z } from 'zod';
import type { ExecutionResult } from '@Services/types';
import { NativeNotebookTransport } from './NativeNotebookTransport';

const pending = z
  .object({
    cell_id: z.string().min(1),
    source: z.string(),
    invocation: z.string().uuid(),
  })
  .strict();
const cellResponse = z.object({
  frontend_notebook_id: z.string(),
  cell_id: z.string(),
  invocation: z.string().uuid(),
  status: z.enum(['ok', 'error', 'pending']),
  error: z.string().optional(),
  outputs: z.array(z.object({ type: z.enum(['text', 'error']), content: z.string() })),
});

/** A transport failure retains the exact invocation; new computations have fresh local state and explicit notebook data transactions. */
export class NativeCellExecution {
  private readonly key: string;
  constructor(
    private readonly notebookId: string,
    private readonly cellId: string,
    private readonly storage: Storage = sessionStorage,
    private readonly transport = new NativeNotebookTransport(notebookId)
  ) {
    this.key = `aal-cell-pending:${JSON.stringify([notebookId, cellId])}`;
  }
  async execute(source: string, signal: AbortSignal): Promise<ExecutionResult> {
    if (new TextEncoder().encode(source).length > 32 * 1024)
      throw new Error('AAL source exceeds 32 KiB');
    signal.throwIfAborted();
    const saved = this.storage.getItem(this.key);
    const previous = saved ? pending.parse(JSON.parse(saved)) : null;
    const request =
      previous?.source === source && previous.cell_id === this.cellId
        ? previous
        : { cell_id: this.cellId, source, invocation: crypto.randomUUID() };
    // Persist before dispatch; a storage failure cannot create an untracked attempt.
    const serialized = JSON.stringify(request);
    this.storage.setItem(this.key, serialized);
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(75_000)]);
    const result = cellResponse.parse(await this.transport.send('execute', request, requestSignal));
    requestSignal.throwIfAborted();
    if (
      result.frontend_notebook_id !== this.notebookId ||
      result.cell_id !== this.cellId ||
      result.invocation !== request.invocation
    )
      throw new Error('Native cell execution identity mismatch');
    // A review wait is observable, but it is not a terminal execution result.
    if (result.status !== 'pending' && this.storage.getItem(this.key) === serialized)
      this.storage.removeItem(this.key);
    return result;
  }
}
