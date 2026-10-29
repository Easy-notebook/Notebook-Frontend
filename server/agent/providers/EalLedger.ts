import { z } from 'zod';
import type { ExecutionSpan } from '../../../src/services/agent-cell/protocol';
export const ledgerSchema = z
  .object({
    trace_id: z.string().min(1),
    records: z.array(
      z
        .object({
          invocation_ura: z.string().min(1),
          ability_name: z.string(),
          state: z.string(),
          started_unix_ms: z.number(),
          completed_unix_ms: z.number().nullable(),
          error: z.unknown().optional(),
        })
        .passthrough()
    ),
    edges: z.array(
      z
        .object({
          from_invocation_ura: z.string().nullable(),
          to_invocation_ura: z.string(),
          relation: z.string(),
        })
        .passthrough()
    ),
  })
  .passthrough();
/** Membership groups under the mission. Causal edges are evidence, not inferred tree parents. */
export function projectLedger(input: unknown, parentId: string): ExecutionSpan[] {
  const graph = ledgerSchema.parse(input);
  const states: Record<string, ExecutionSpan['status']> = {
    accepted: 'queued',
    admitted: 'queued',
    dispatched: 'queued',
    running: 'running',
    completed: 'done',
    failed: 'failed',
    timed_out: 'failed',
    cancelled: 'stopped',
  };
  return graph.records.map((record) => {
    const status = states[record.state.toLowerCase()];
    if (!status) throw new Error(`Unrecognized ledger state: ${record.state}`);
    return {
      id: record.invocation_ura,
      parentId,
      runtime: 'eal',
      name: record.ability_name,
      status,
      startedAt: record.started_unix_ms,
      endedAt: record.completed_unix_ms ?? undefined,
      invocation: record.invocation_ura,
      error: record.error == null ? undefined : JSON.stringify(record.error),
    };
  });
}
