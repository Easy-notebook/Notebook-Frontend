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
const lookupIdentity = z.object({
  frontend_notebook_id: z.string(),
  cell_id: z.string(),
  invocation: z.string().uuid(),
});
const cellLookup = z.discriminatedUnion('status', [
  lookupIdentity.extend({
    status: z.literal('completed'),
    result: cellResponse.extend({ status: z.enum(['ok', 'error']) }),
  }),
  lookupIdentity.extend({ status: z.literal('unconfirmed'), result: z.null() }),
]);

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
  private verifyIdentity(value: z.infer<typeof lookupIdentity>, invocation: string) {
    if (
      value.frontend_notebook_id !== this.notebookId ||
      value.cell_id !== this.cellId ||
      value.invocation !== invocation
    )
      throw new Error('Native cell execution identity mismatch');
  }
  async execute(source: string, signal: AbortSignal): Promise<ExecutionResult> {
    if (new TextEncoder().encode(source).length > 32 * 1024)
      throw new Error('AAL source exceeds 32 KiB');
    signal.throwIfAborted();
    const saved = this.storage.getItem(this.key);
    const previous = saved ? pending.parse(JSON.parse(saved)) : null;
    const recovering = previous?.source === source && previous.cell_id === this.cellId;
    const request = recovering
      ? previous
      : { cell_id: this.cellId, source, invocation: crypto.randomUUID() };
    // Persist before dispatch; a storage failure cannot create an untracked attempt.
    const serialized = JSON.stringify(request);
    this.storage.setItem(this.key, serialized);
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(75_000)]);
    let retained: z.infer<typeof cellResponse> | null = null;
    if (recovering) {
      const lookup = cellLookup.parse(
        await this.transport.send('executions/lookup', request, requestSignal)
      );
      requestSignal.throwIfAborted();
      this.verifyIdentity(lookup, request.invocation);
      if (lookup.status === 'completed') retained = lookup.result;
    }
    // Only an explicit Run reaches this method. An unconfirmed lookup is not
    // proof of non-execution; the same request continues through native replay.
    const result =
      retained ?? cellResponse.parse(await this.transport.send('execute', request, requestSignal));
    requestSignal.throwIfAborted();
    this.verifyIdentity(result, request.invocation);
    // A review wait is observable, but it is not a terminal execution result.
    if (result.status !== 'pending' && this.storage.getItem(this.key) === serialized)
      this.storage.removeItem(this.key);
    return result;
  }
}
