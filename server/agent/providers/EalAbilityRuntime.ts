import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { AgentRuntime, ProviderRun } from './types';
import type { ExecutionSpan } from '../../../src/services/agent-cell/protocol';
import { AbilityModelHost } from './AbilityModelHost';
import { EalMissionClient } from './EalMissionClient';
import { watchEal } from './EalWatch';
import { projectLedger } from './EalLedger';
const exec = promisify(execFile);
const metadata = z.object({
  name: z.string(),
  source_file: z.string().nullable(),
  trace_id: z.string().min(1),
  started_at: z.string(),
  status: z.string(),
});
/** EAL owns dispatch; the local broker attaches the admitted AAL Host to this conversation. */
export class EalAbilityRuntime implements AgentRuntime {
  constructor(
    private readonly model: AgentRuntime,
    private readonly target: string,
    private readonly executable = process.env.EASYNET_CLI || 'easynet',
    private readonly runsDirectory = join(homedir(), '.easynet/missions/runs'),
    private readonly agent: 'NotebookAgent' | 'CodexAgent' = 'NotebookAgent'
  ) {}
  async run(run: ProviderRun) {
    run.signal.throwIfAborted();
    if (!/^[a-zA-Z0-9_./:@-]+$/.test(this.target)) throw new Error('Invalid EasyNet target');
    let root: ExecutionSpan | undefined;
    const localRoots = new Map<string, ExecutionSpan>();
    const host = await AbilityModelHost.open(
      this.model,
      {
        ...run,
        emit: (event) => {
          if (event.type === 'span' && event.span.runtime === 'aal') {
            const span = { ...event.span, parentId: root?.id };
            localRoots.set(span.id, span);
            run.emit({ type: 'span', span });
          } else run.emit(event);
        },
      },
      this.agent
    );
    const directory = await mkdtemp(join(tmpdir(), 'notebook-eal-'));
    const file = join(directory, 'mission.eal');
    const name = `notebook-${randomUUID()}`;
    const client = new EalMissionClient(this.executable);
    const observer = new AbortController();
    const launcher = new AbortController();
    let runId: string | undefined;
    let subscription: Promise<void> | undefined;
    let observationFailure: unknown;
    let launchDone = false;
    let cancelRequested = run.signal.aborted;
    // One authoritative turn stream feeds both chat and details.
    const emit = (span: ExecutionSpan) => run.emit({ type: 'span', span });
    const cancellation = () => {
      cancelRequested = true;
    };
    run.signal.addEventListener('abort', cancellation, { once: true });
    try {
      const source = `mission ${JSON.stringify(name)} {\n let result = call "${this.agent === 'CodexAgent' ? 'notebook.codex' : 'notebook.agent'}" on ${JSON.stringify(this.target)} with { connection = ${JSON.stringify(host.connection)} } timeout 1800\n}`;
      await writeFile(file, source, { mode: 0o600 });
      const ignored = new Set(
        await readdir(this.runsDirectory).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [];
          throw error;
        })
      );
      const launched = exec(this.executable, ['mission', 'run', file, '--format', 'json'], {
        signal: launcher.signal,
        timeout: 30 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
      })
        .then(
          (result) => ({ result, error: undefined }),
          (error) => ({ result: undefined, error })
        )
        .finally(() => {
          launchDone = true;
        });
      // Only discover the live anchor here. Execution progress comes from invocation.watch/ledger.
      // Match the exact unique source path and mission name, never the newest directory.
      let cancelDeadline: number | undefined;
      while (!runId && !launchDone) {
        const entries = await readdir(this.runsDirectory, { withFileTypes: true }).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return [];
            throw error;
          }
        );
        for (const entry of entries) {
          if (!entry.isDirectory() || ignored.has(entry.name)) continue;
          let meta;
          try {
            meta = metadata.parse(
              JSON.parse(await readFile(join(this.runsDirectory, entry.name, 'meta.json'), 'utf8'))
            );
          } catch {
            continue;
          }
          if (meta.name !== name || meta.source_file !== file) {
            ignored.add(entry.name);
            continue;
          }
          runId = entry.name;
          const startedAt = Date.parse(meta.started_at);
          if (!Number.isFinite(startedAt)) throw new Error('Invalid mission start timestamp');
          root = {
            id: `eal:${meta.trace_id}`,
            runtime: 'eal',
            name: 'Notebook Agent',
            status: 'running',
            startedAt,
            invocation: meta.trace_id,
          };
          emit(root);
          for (const span of localRoots.values()) emit({ ...span, parentId: root.id });
          subscription = (async () => {
            while (!observer.signal.aborted && !launchDone) {
              let terminal = false;
              for await (const event of watchEal(meta.trace_id, observer.signal, this.executable)) {
                if (event.event === 'state' || event.event === 'terminal') {
                  for (const span of projectLedger(
                    await client.ledger(meta.trace_id, observer.signal),
                    root!.id
                  ))
                    emit(span);
                  terminal = event.event === 'terminal';
                }
                if (event.event === 'liveness')
                  run.emit({
                    type: 'activity',
                    id: `observer:${meta.trace_id}`,
                    label: '轨迹订阅等待更新',
                    status: 'running',
                    detail: `${event.status} (${event.source}); execution status remains ledger-owned`,
                  });
              }
              if (terminal) break;
              await delay(250, undefined, { signal: observer.signal });
            }
          })().catch((error) => {
            if (!observer.signal.aborted) observationFailure = error;
          });
          break;
        }
        if (cancelRequested) {
          cancelDeadline ??= Date.now() + 10_000;
          if (!runId && Date.now() > cancelDeadline)
            throw new Error('Cancellation unconfirmed: mission anchor was not published');
        }
        if (!runId && !launchDone) await delay(200);
      }
      if (cancelRequested && runId) {
        cancelRequested = false;
        await client.cancel(runId);
      }
      // Continue to relay explicit cancellation while the launcher awaits daemon completion.
      const monitor = setInterval(() => {
        if (cancelRequested && runId) {
          cancelRequested = false;
          void client.cancel(runId).catch((error) => {
            observationFailure = error;
            launcher.abort();
          });
        }
      }, 100);
      let outcome;
      try {
        outcome = await launched;
      } finally {
        clearInterval(monitor);
      }
      if (outcome.error) throw outcome.error;
      const result = z
        .object({
          run_id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
          trace_id: z.string(),
          status: z.string(),
          duration_ms: z.number().nonnegative(),
        })
        .passthrough()
        .parse(JSON.parse(outcome.result!.stdout));
      observer.abort();
      await subscription;
      if (!root) {
        const meta = metadata.parse(
          JSON.parse(await readFile(join(this.runsDirectory, result.run_id, 'meta.json'), 'utf8'))
        );
        if (meta.name !== name || meta.source_file !== file || meta.trace_id !== result.trace_id)
          throw new Error('Mission result ownership mismatch');
        const startedAt = Date.parse(meta.started_at);
        if (!Number.isFinite(startedAt)) throw new Error('Invalid mission start timestamp');
        root = {
          id: `eal:${meta.trace_id}`,
          runtime: 'eal',
          name: 'Notebook Agent',
          status: 'running',
          startedAt,
          invocation: meta.trace_id,
        };
      }
      if (root) {
        for (const span of projectLedger(await client.ledger(result.trace_id), root.id)) emit(span);
        emit({
          ...root,
          status:
            result.status === 'ok' ? 'done' : result.status === 'cancelled' ? 'stopped' : 'failed',
          endedAt: root.startedAt + result.duration_ms,
        });
      }
      for (const span of localRoots.values())
        emit({
          ...span,
          parentId: root?.id,
          status:
            result.status === 'ok' ? 'done' : result.status === 'cancelled' ? 'stopped' : 'failed',
          endedAt: Date.now(),
        });
      run.emit({
        type: 'activity',
        id: `observer:${result.trace_id}`,
        label: '实时轨迹同步',
        status: observationFailure ? 'failed' : 'completed',
        detail: observationFailure ? String(observationFailure) : undefined,
      });
      if (observationFailure) throw observationFailure;
      run.signal.throwIfAborted();
      if (result.status !== 'ok') throw new Error(`EAL mission ended: ${result.status}`);
    } catch (error) {
      if (runId && !launchDone) {
        try {
          await client.cancel(runId);
        } catch (cancelError) {
          throw new Error(
            `${String(error)}; daemon cancellation unconfirmed: ${String(cancelError)}`
          );
        }
      }
      throw error;
    } finally {
      run.signal.removeEventListener('abort', cancellation);
      observer.abort();
      launcher.abort();
      await subscription;
      await host.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
}
