import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { z } from 'zod';
import {
  toolSchemas,
  toolsForRole,
  toolDescriptions,
  toolNameSchema,
} from '../../../src/services/agent-cell/protocol';
import { instructionsForRole, type AgentRuntime, type ProviderRun } from './types';

/** One app-server process per active run; persisted thread identity belongs to its bridge session. */
export class CodexRuntime implements AgentRuntime {
  async run(run: ProviderRun): Promise<void> {
    run.signal.throwIfAborted();
    const cli = join(
      dirname(createRequire(import.meta.url).resolve('@openai/codex/package.json')),
      'bin/codex.js'
    );
    const child = spawn(
      process.env.NOTEBOOK_CODEX_BIN || process.execPath,
      process.env.NOTEBOOK_CODEX_BIN ? ['app-server'] : [cli, 'app-server'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    let sequence = 0;
    let stderr = '';
    let settled = false;
    const pending = new Map<
      number,
      { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout }
    >();
    let finish!: (error?: Error) => void;
    const completion = new Promise<void>((resolve, reject) => {
      finish = (error) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };
    });
    // Observe early process errors even while awaiting initialization.
    void completion.catch(() => {});
    const send = (message: unknown) => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    const fail = (error: Error) => {
      finish(error);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
    };
    const request = (method: string, params: unknown): Promise<any> =>
      new Promise((resolve, reject) => {
        if (settled) {
          reject(new Error('Codex connection closed'));
          return;
        }
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Codex ${method} timed out`));
        }, 60_000);
        pending.set(id, { resolve, reject, timer });
        send({ id, method, params });
      });
    const abort = () => fail(new Error('Agent run cancelled'));
    run.signal.addEventListener('abort', abort, { once: true });
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stderr.on('data', (data) => {
      stderr = (stderr + String(data)).slice(-4000);
    });
    child.on('exit', (code) => fail(new Error(`Codex exited (${code}): ${stderr}`)));
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      try {
        const message = JSON.parse(line);
        if (message.type === 'error') {
          fail(new Error(message.error?.message || 'Codex protocol error'));
          return;
        }
        if (message.id !== undefined && !message.method) {
          const waiter = pending.get(message.id);
          if (waiter) {
            pending.delete(message.id);
            clearTimeout(waiter.timer);
            message.error
              ? waiter.reject(new Error(message.error.message))
              : waiter.resolve(message.result);
          }
          return;
        }
        const p = message.params;
        if (message.method === 'item/tool/call') {
          void (async () => {
            let result;
            try {
              if (p.threadId !== run.session.threadId)
                throw new Error('Tool thread identity mismatch');
              result = await run.call(toolNameSchema.parse(p.tool), p.arguments);
            } catch (error) {
              result = { ok: false, error: String(error) };
            }
            if (!settled)
              send({
                id: message.id,
                result: {
                  success: result.ok,
                  contentItems: [{ type: 'inputText', text: JSON.stringify(result) }],
                },
              });
          })();
        } else if (message.id !== undefined) {
          // This version exposes only notebook tools; unsupported interactive requests fail explicitly.
          send({
            id: message.id,
            error: { code: -32601, message: 'Only notebook tools are supported by this client' },
          });
        } else if (p?.threadId && p.threadId !== run.session.threadId) {
          return;
        } else if (message.method === 'item/agentMessage/delta') {
          run.emit({ type: 'text', text: p.delta });
        } else if (
          (message.method === 'item/started' || message.method === 'item/completed') &&
          p.item &&
          !['agentMessage', 'userMessage', 'reasoning', 'dynamicToolCall'].includes(p.item.type)
        ) {
          run.emit({
            type: 'activity',
            id: p.item.id,
            label: p.item.type,
            status: message.method === 'item/started' ? 'running' : 'completed',
            detail: JSON.stringify(p.item),
          });
        } else if (message.method === 'error' && !p.willRetry) {
          fail(new Error(p.error?.message || 'Codex run failed'));
        } else if (message.method === 'turn/completed') {
          finish(
            p.turn.status === 'completed'
              ? undefined
              : new Error(p.turn.error?.message || `Codex turn ${p.turn.status}`)
          );
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    try {
      await request('initialize', {
        clientInfo: { name: 'notebook_agent_cell', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      });
      send({ method: 'initialized', params: {} });
      const options = {
        approvalPolicy: 'never',
        sandbox: 'read-only',
        developerInstructions: instructionsForRole(run.role),
      };
      if (run.session.threadId) {
        await request('thread/resume', { ...options, threadId: run.session.threadId });
      } else {
        const result = await request('thread/start', {
          ...options,
          dynamicTools: Object.entries(toolsForRole(run.role)).map(([name, schema]) => ({
            type: 'function',
            name,
            description: toolDescriptions[name as keyof typeof toolSchemas],
            inputSchema: z.toJSONSchema(schema),
          })),
        });
        run.session.threadId = result.thread.id;
      }
      run.signal.throwIfAborted();
      await request('turn/start', {
        threadId: run.session.threadId,
        input: [{ type: 'text', text: run.prompt }],
      });
      await completion;
    } finally {
      run.signal.removeEventListener('abort', abort);
      lines.close();
      fail(new Error('Codex run closed'));
      child.kill('SIGTERM');
      const kill = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 2000);
      kill.unref();
      child.once('exit', () => clearTimeout(kill));
    }
  }
}
