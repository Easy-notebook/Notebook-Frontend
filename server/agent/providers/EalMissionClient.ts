import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { ExecutionSpan } from '../../../src/services/agent-cell/protocol';
const exec = promisify(execFile);
const traceSchema = z
  .object({
    schema_version: z.literal(1),
    mission_id: z.string(),
    mission_name: z.string(),
    started_at_unix_ms: z.number(),
    completed_at_unix_ms: z.number(),
    outcome: z.enum(['completed', 'partial', 'aborted']),
    traces_truncated: z.number(),
    step_traces: z.array(
      z
        .object({
          step_id: z.string(),
          ability: z.string(),
          started_at_unix_ms: z.number(),
          completed_at_unix_ms: z.number(),
          outcome: z.enum(['completed', 'failed', 'skipped']),
          error: z.string().nullable(),
          invocation: z.unknown().optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();
/** Read model only. Mission lifecycle, authority and receipts stay daemon-owned. */
export class EalMissionClient {
  constructor(private readonly executable = process.env.EASYNET_CLI || 'easynet') {}
  private async command(args: string[], signal?: AbortSignal) {
    const { stdout } = await exec(this.executable, args, {
      signal,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    });
    return stdout;
  }
  private async source<T>(source: string, operation: (file: string) => Promise<T>) {
    if (Buffer.byteLength(source) > 1024 * 1024) throw new Error('EAL source exceeds 1 MiB');
    const dir = await mkdtemp(join(tmpdir(), 'notebook-eal-'));
    try {
      const file = join(dir, 'mission.eal');
      await writeFile(file, source, { mode: 0o600 });
      return await operation(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  compile(source: string, signal?: AbortSignal) {
    return this.source(source, (file) =>
      this.command(['mission', 'compile', file, '--emit-ir'], signal)
    );
  }
  // A disconnected client does not prove daemon cancellation. Cancel explicitly by runId.
  run(source: string, signal?: AbortSignal) {
    return this.source(
      source,
      async (file) =>
        JSON.parse(
          await this.command(['mission', 'run', file, '--format', 'json'], signal)
        ) as unknown
    );
  }
  async ledger(trace: string, signal?: AbortSignal) {
    if (!trace || trace.length > 2048 || /[\x00-\x20]/.test(trace) || trace.startsWith('-'))
      throw new Error('Invalid trace anchor');
    const output = await this.command(['invocation', 'trace', trace, '--format', 'json'], signal);
    return z
      .object({
        trace_id: z.string(),
        records: z.array(z.record(z.string(), z.unknown())),
        edges: z.array(z.record(z.string(), z.unknown())),
      })
      .passthrough()
      .parse(JSON.parse(output));
  }
  cancel(runId: string) {
    this.validateId(runId);
    return this.command(['mission', 'cancel', runId]);
  }
  async trace(runId: string) {
    this.validateId(runId);
    const output = await this.command(['mission', 'show', runId, '--trace']);
    // CLI prints a human preamble before the JSON document.
    const start = output.indexOf('{');
    if (start < 0) throw new Error('No EAL trace document returned');
    const trace = traceSchema.parse(JSON.parse(output.slice(start)));
    return { document: trace, spans: projectEalTrace(trace) };
  }
  private validateId(id: string) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid mission run ID');
  }
}
export function projectEalTrace(trace: z.infer<typeof traceSchema>): ExecutionSpan[] {
  const status = (outcome: string): ExecutionSpan['status'] => {
    if (outcome === 'completed') return 'done';
    if (outcome === 'aborted' || outcome === 'skipped') return 'stopped';
    return 'failed';
  };
  const root = `eal:${trace.mission_id}`;
  return [
    {
      id: root,
      runtime: 'eal',
      name: trace.mission_name,
      status: status(trace.outcome),
      startedAt: trace.started_at_unix_ms,
      endedAt: trace.completed_at_unix_ms,
      invocation: trace.mission_id,
    },
    ...trace.step_traces.map((step) => ({
      id: `${root}:${step.step_id}`,
      parentId: root,
      runtime: 'eal' as const,
      name: step.ability,
      status: status(step.outcome),
      startedAt: step.started_at_unix_ms,
      endedAt: step.completed_at_unix_ms,
      error: step.error ?? undefined,
    })),
  ];
}
