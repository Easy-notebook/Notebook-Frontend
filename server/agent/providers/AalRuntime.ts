import { NotebookModelHost } from './NotebookModelHost';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentRuntime, ProviderRun } from './types';
import type { ExecutionSpan } from '../../../src/services/agent-cell/protocol';
const messageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('started'),
    invocation: z.string(),
    agent: z.string(),
    ability: z.string(),
  }),
  z.object({
    type: z.literal('host_call'),
    id: z.string(),
    agent: z.string(),
    invocation: z.string(),
    operation: z.enum(['skill.notebook_model', 'skill.codex']),
    arguments: z.tuple([z.string()]),
  }),
  z.object({ type: z.literal('completed'), invocation: z.string(), result: z.unknown() }),
  z.object({ type: z.literal('failed'), error: z.string() }),
]);
/** AAL owns invocation; the model runtime is only a native Host implementation. */
export class AalRuntime implements AgentRuntime {
  constructor(
    private readonly model: AgentRuntime,
    private readonly executable = process.env.AAL_AGENT_WORKER,
    private readonly agent: 'NotebookAgent' | 'CodexAgent' = 'NotebookAgent'
  ) {}
  async run(run: ProviderRun): Promise<void> {
    if (!this.executable)
      throw new Error(
        'AAL_AGENT_WORKER is not configured. Build the native aal-agent-cell worker; direct model execution is disabled.'
      );
    run.signal.throwIfAborted();
    const invocation = randomUUID();
    const child = spawn(this.executable, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const controller = new AbortController();
    const abort = () => {
      controller.abort();
      child.kill('SIGTERM');
    };
    run.signal.addEventListener('abort', abort, { once: true });
    if (run.signal.aborted) abort();
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4096);
    });
    let failure: Error | undefined;
    const exited = new Promise<number | null>((resolve) => {
      child.once('error', (error) => {
        failure = error;
        resolve(null);
      });
      child.once('close', (code) => {
        controller.abort();
        resolve(code);
      });
    });
    child.stdin.on('error', () => {});
    const spans = new Map<string, ExecutionSpan>();
    const emitSpan = (span: ExecutionSpan) => {
      spans.set(span.id, span);
      run.emit({ type: 'span', span });
    };
    let completed = false;
    let modelCalled = false;
    child.stdin.write(JSON.stringify({ invocation, prompt: run.prompt, agent: this.agent }) + '\n');
    try {
      for await (const line of createInterface({ input: child.stdout })) {
        if (line.length > 2_000_000) throw new Error('AAL worker message too large');
        const message = messageSchema.parse(JSON.parse(line));
        if (message.type === 'failed') throw new Error(message.error);
        if (message.invocation !== invocation) throw new Error('AAL invocation identity mismatch');
        if ('agent' in message && message.agent !== this.agent)
          throw new Error('AAL agent identity mismatch');
        if (message.type === 'started') {
          if (message.ability !== 'run') throw new Error('AAL ability identity mismatch');
          emitSpan({
            id: invocation,
            runtime: 'aal',
            name: `${message.agent}.${message.ability}`,
            status: 'running',
            startedAt: Date.now(),
            invocation,
          });
        } else if (message.type === 'host_call') {
          if (
            message.operation !==
            (this.agent === 'CodexAgent' ? 'skill.codex' : 'skill.notebook_model')
          )
            throw new Error('AAL skill identity mismatch');
          if (modelCalled || !spans.has(invocation))
            throw new Error('Unexpected AAL host lifecycle');
          modelCalled = true;
          try {
            const result = await new NotebookModelHost(this.model).execute(
              { ...run, signal: controller.signal },
              spans.get(invocation)!,
              message.arguments[0],
              message.operation
            );
            child.stdin.write(JSON.stringify({ id: message.id, result }) + '\n');
          } catch (error) {
            child.stdin.write(JSON.stringify({ id: message.id, error: String(error) }) + '\n');
          }
        } else {
          if (!modelCalled || !spans.has(invocation))
            throw new Error('AAL completed before host execution');
          completed = true;
        }
      }
      const code = await exited;
      run.signal.throwIfAborted();
      if (failure) throw failure;
      if (code !== 0 || !completed)
        throw new Error(`AAL worker did not complete (${code}): ${stderr}`);
      emitSpan({ ...spans.get(invocation)!, status: 'done', endedAt: Date.now() });
    } catch (error) {
      for (const span of spans.values())
        if (span.status === 'running')
          emitSpan({
            ...span,
            status: run.signal.aborted ? 'stopped' : 'failed',
            endedAt: Date.now(),
            error: String(error),
          });
      throw error;
    } finally {
      run.signal.removeEventListener('abort', abort);
      abort();
      const kill = setTimeout(() => child.kill('SIGKILL'), 2000);
      await exited;
      clearTimeout(kill);
    }
  }
}
