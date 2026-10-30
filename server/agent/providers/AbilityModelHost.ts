import { notebookSkillSchema, acceptNotebookSkill } from '../skills/NotebookSkill';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AgentRuntime, ProviderRun } from './types';
import { NotebookModelHost } from './NotebookModelHost';

/** One owner-only, one-use Host attachment per run; never an externally exposed service. */
export class AbilityModelHost {
  static async open(
    model: AgentRuntime,
    run: ProviderRun,
    agent: 'NotebookAgent' | 'CodexAgent' = 'NotebookAgent'
  ) {
    const directory = await mkdtemp(join('/tmp', 'notebook-aal-'));
    await chmod(directory, 0o700);
    const ticket = randomBytes(32).toString('hex');
    const path = join(directory, 'host.sock');
    const sockets = new Set<Socket>();
    let claimed = false;
    const operations = new Set<Promise<void>>();
    const controller = new AbortController();
    const abort = () => {
      controller.abort();
      for (const socket of sockets) socket.destroy();
    };
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.once('close', () => sockets.delete(socket));
      socket.setTimeout(30_000, () => socket.destroy());
      let authorized = false;
      socket.once('close', () => {
        if (authorized && !socket.writableEnded) controller.abort();
      });
      let buffer = '';
      const receive = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        if (buffer.length > 262144) {
          socket.destroy();
          return;
        }
        if (!buffer.includes('\n')) return;
        socket.off('data', receive);
        const operation = (async () => {
          let id = '';
          try {
            const request = z
              .object({
                ticket: z.string().length(64),
                id: z.string().min(1),
                invocation: z.string().min(1),
                agent: z.literal(agent),
                operation: z.literal('skill.notebook'),
                skill: notebookSkillSchema,
              })
              .strict()
              .parse(JSON.parse(buffer.slice(0, buffer.indexOf('\n'))));
            if (claimed || !timingSafeEqual(Buffer.from(request.ticket), Buffer.from(ticket)))
              throw new Error('Host attachment expired or invalid');
            controller.signal.throwIfAborted();
            claimed = true;
            authorized = true;
            id = request.id;
            socket.setTimeout(0);
            // The native kernel supplies its own invocation identity; it is not a signed ledger URA.
            const span = {
              id: request.invocation,
              runtime: 'aal' as const,
              name: `${agent}.run`,
              status: 'running' as const,
              startedAt: Date.now(),
              invocation: request.invocation,
            };
            run.emit({ type: 'span', span });
            try {
              const result = await new NotebookModelHost(model).execute(
                {
                  ...run,
                  signal: controller.signal,
                  notebookSkill: acceptNotebookSkill(request.skill),
                },
                span,
                run.prompt,
                request.operation
              );
              socket.end(JSON.stringify({ id, result }) + '\n');
              // Kernel completion is reported by the admitted provider, not by this Host return.
            } catch (error) {
              run.emit({
                type: 'span',
                span: {
                  ...span,
                  status: controller.signal.aborted ? 'stopped' : 'failed',
                  endedAt: Date.now(),
                  error: String(error),
                },
              });
              throw error;
            }
          } catch (error) {
            socket.end(JSON.stringify({ id, error: String(error) }) + '\n');
          }
        })();
        operations.add(operation);
        void operation.finally(() => operations.delete(operation));
      };
      socket.on('data', receive);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(path, resolve);
      });
      run.signal.addEventListener('abort', abort, { once: true });
      if (run.signal.aborted) abort();
      return {
        connection: `${path}#${ticket}`,
        async close() {
          run.signal.removeEventListener('abort', abort);
          abort();
          await new Promise<void>((resolve) => server.close(() => resolve()));
          await Promise.all(operations);
          await rm(directory, { recursive: true, force: true });
        },
      };
    } catch (error) {
      server.close();
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}
