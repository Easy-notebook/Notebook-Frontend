import { ProviderSessions, sourceSchema } from './ProviderSessions';
import { NotebookArtifactStore } from './NotebookArtifactStore';
import { EalAbilityRuntime } from './providers/EalAbilityRuntime';
import { watchEal } from './providers/EalWatch';
import { EalMissionClient } from './providers/EalMissionClient';
import { AalRuntime } from './providers/AalRuntime';
import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  runRequestSchema,
  toolReplySchema,
  toolSchemas,
  toolsForRole,
  type AgentEvent,
  type AgentProvider,
  type ToolName,
  type ToolResult,
} from '../../src/services/agent-cell/protocol';
import { CodexRuntime } from './providers/CodexRuntime';
import { ClaudeRuntime } from './providers/ClaudeRuntime';
import type { AgentRuntime, ProviderSession } from './providers/types';

interface Session extends ProviderSession {
  owner: string;
  active?: string;
  touched: number;
}
interface PendingTool {
  resolve(result: ToolResult): void;
  timer: NodeJS.Timeout;
  started?: boolean;
  onStart?: () => void;
}
interface ActiveRun {
  controller: AbortController;
  tools: Map<string, PendingTool>;
}
async function body(request: IncomingMessage, limit = 2_000_000): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new Error('JSON required');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

export const nativeProviders = (
  worker = process.env.AAL_AGENT_WORKER,
  target = process.env.AAL_EASYNET_TARGET
): Record<AgentProvider, AgentRuntime> => ({
  codex: target
    ? new EalAbilityRuntime(new CodexRuntime(), target, undefined, undefined, 'CodexAgent')
    : new AalRuntime(new CodexRuntime(), worker, 'CodexAgent'),
  claude: target
    ? new EalAbilityRuntime(new ClaudeRuntime(), target)
    : new AalRuntime(new ClaudeRuntime(), worker),
});
/** Same-origin local bridge. Provider session IDs never come from the browser. */
export class AgentBridge {
  private readonly bindingNotebooks = new Set<string>();
  private readonly admittingNotebooks = new Set<string>();
  private readonly sourceRuns = new Set<string>();
  private discoveryActive = 0;
  private readonly sessions = new Map<string, Session>();
  private readonly runs = new Map<string, ActiveRun>();
  constructor(
    private readonly providers: Record<AgentProvider, AgentRuntime> = nativeProviders(),
    private readonly artifacts = new NotebookArtifactStore(),
    private readonly sources = new ProviderSessions()
  ) {}

  close(): void {
    for (const run of this.runs.values()) run.controller.abort();
  }

  handle = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void
  ): Promise<void> => {
    const route = request.url?.split('?')[0];
    if (!route?.startsWith('/agent-api/')) {
      next();
      return;
    }
    const host = request.headers.host || '';
    const origin = request.headers.origin;
    if (
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
      (origin && origin !== `http://${host}`) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      json(response, 403, { error: 'Local same-origin requests required' });
      return;
    }
    if (request.method !== 'POST') {
      json(response, 405, { error: 'POST required' });
      return;
    }
    let admissionNotebook: string | undefined;
    try {
      const artifactRoute = route.startsWith('/agent-api/notebook-files/');
      const input = await body(request, artifactRoute ? 32_000_000 : 2_000_000);
      if (route.startsWith('/agent-api/sessions/')) {
        if (this.discoveryActive >= 2) throw new Error('Session discovery is busy');
        this.discoveryActive++;
        try {
          const operation = route.slice('/agent-api/sessions/'.length);
          if (operation === 'list') {
            const query = z
              .object({
                provider: z.enum(['codex', 'claude']),
                cursor: z.string().max(2048).optional(),
              })
              .strict()
              .parse(input);
            json(response, 200, await this.sources.list(query.provider, query.cursor));
          } else if (operation === 'preview')
            json(response, 200, await this.sources.history(sourceSchema.strict().parse(input)));
          else if (operation === 'bind') {
            const query = sourceSchema
              .extend({
                notebookId: z.string().min(1).max(200),
                revision: z.number().int().nonnegative(),
                agentId: z.string().max(512),
              })
              .strict()
              .parse(input);
            if (
              this.bindingNotebooks.has(query.notebookId) ||
              this.admittingNotebooks.has(query.notebookId)
            )
              throw new Error('Notebook binding is busy');
            this.bindingNotebooks.add(query.notebookId);
            try {
              if (
                [...this.sessions.values()].some(
                  (s) => s.active && JSON.parse(s.owner)[0] === query.notebookId
                )
              )
                throw new Error(
                  'Wait for the notebook agent to finish before connecting a session'
                );
              const profile = await this.artifacts.readAgent(query.notebookId);
              if (profile.agentId !== query.agentId)
                throw new Error('Notebook Agent ownership mismatch');
              const info = await this.sources.inspect(query);
              if (this.sourceRuns.has(`${query.provider}:${query.sessionId}`))
                throw new Error('Source session is already running');
              json(
                response,
                200,
                await this.artifacts.bindSession(
                  query.notebookId,
                  { provider: info.provider, sessionId: info.sessionId, cwd: info.cwd },
                  query.revision
                )
              );
            } finally {
              this.bindingNotebooks.delete(query.notebookId);
            }
          } else throw new Error('Unknown session operation');
        } finally {
          this.discoveryActive--;
        }
        return;
      }
      if (artifactRoute) {
        json(
          response,
          200,
          await this.artifacts.execute(route.slice('/agent-api/notebook-files/'.length), input)
        );
        return;
      }
      if (route.startsWith('/agent-api/eal/')) {
        const client = new EalMissionClient();
        const operation = route.slice('/agent-api/eal/'.length);
        if (operation === 'watch') {
          const { trace } = z
            .object({ trace: z.string().min(1).max(2048) })
            .strict()
            .parse(input);
          const controller = new AbortController();
          const disconnect = () => controller.abort();
          response.on('close', disconnect);
          response.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
          });
          try {
            for await (const event of watchEal(trace, controller.signal)) {
              response.write(JSON.stringify(event) + '\n');
              if (event.event === 'state' || event.event === 'terminal') {
                const document = await client.ledger(trace, controller.signal);
                response.write(JSON.stringify({ event: 'ledger', document }) + '\n');
              }
            }
            if (!controller.signal.aborted)
              response.write(JSON.stringify({ event: 'observer_end' }) + '\n');
          } catch (error) {
            if (!controller.signal.aborted)
              response.write(
                JSON.stringify({
                  event: 'observer_error',
                  error: error instanceof Error ? error.message : String(error),
                }) + '\n'
              );
          } finally {
            response.off('close', disconnect);
            response.end();
          }
        } else if (operation === 'compile' || operation === 'run') {
          const { source } = z
            .object({ source: z.string().min(1).max(1_000_000) })
            .strict()
            .parse(input);
          json(
            response,
            200,
            operation === 'compile'
              ? { ir: await client.compile(source) }
              : await client.run(source)
          );
        } else if (operation === 'trace' || operation === 'cancel') {
          const { runId } = z.object({ runId: z.string() }).strict().parse(input);
          json(
            response,
            200,
            operation === 'trace'
              ? await client.trace(runId)
              : { result: await client.cancel(runId) }
          );
        } else json(response, 404, { error: 'Unknown EAL operation' });
        return;
      }
      if (route === '/agent-api/tool-start') {
        const start = z
          .object({ runId: z.string().uuid(), callId: z.string().uuid() })
          .strict()
          .parse(input);
        const run = this.runs.get(start.runId);
        const pending = run?.tools.get(start.callId);
        if (!pending || pending.started || run?.controller.signal.aborted) {
          json(response, 409, { error: 'Tool call is no longer available' });
          return;
        }
        pending.started = true;
        pending.onStart?.();
        // Starting execution gets a fresh tool deadline after the human decision.
        pending.timer.refresh();
        json(response, 200, { ok: true });
        return;
      }
      if (route === '/agent-api/tool-result') {
        const reply = toolReplySchema.parse(input);
        const run = this.runs.get(reply.runId);
        const pending = run?.tools.get(reply.callId);
        if (!pending || run?.controller.signal.aborted) {
          json(response, 409, { error: 'Tool call is no longer active' });
          return;
        }
        run!.tools.delete(reply.callId);
        clearTimeout(pending.timer);
        pending.resolve(reply.result);
        json(response, 200, { ok: true });
        return;
      }
      if (route !== '/agent-api/run') {
        json(response, 404, { error: 'Unknown agent route' });
        return;
      }
      const inputRun = runRequestSchema.parse(input);
      if (this.admittingNotebooks.has(inputRun.notebookId))
        throw new Error('Notebook admission is busy');
      this.admittingNotebooks.add(inputRun.notebookId);
      admissionNotebook = inputRun.notebookId;
      if (this.bindingNotebooks.has(inputRun.notebookId))
        throw new Error('Notebook binding is changing');
      const notebookAgent = inputRun.notebookAgentId
        ? await this.artifacts.readAgent(inputRun.notebookId)
        : undefined;
      if (
        notebookAgent &&
        (notebookAgent.agentId !== inputRun.notebookAgentId ||
          notebookAgent.provider !== inputRun.provider ||
          (inputRun.role && inputRun.role !== 'worker'))
      )
        throw new Error('Notebook agent binding changed; reload before sending');
      const source = notebookAgent?.source;
      const sourceKey = source ? `${source.provider}:${source.sessionId}` : undefined;
      if ((source?.sessionId ?? undefined) !== inputRun.sourceSessionId)
        throw new Error('Source session binding changed; reopen the terminal');
      if (source) {
        if (this.sourceRuns.has(sourceKey!))
          throw new Error('This source session is already running');
        const actual = await this.sources.inspect(source);
        if (actual.cwd !== source.cwd || actual.provider !== inputRun.provider)
          throw new Error('Source session environment changed');
      }
      if (this.bindingNotebooks.has(inputRun.notebookId))
        throw new Error('Notebook binding is changing');
      const owner = JSON.stringify([
        inputRun.notebookId,
        inputRun.cellId,
        inputRun.notebookAgentId ?? null,
        inputRun.sourceSessionId ?? null,
        inputRun.provider,
        inputRun.role ?? 'worker',
      ]);
      if (response.destroyed) return;
      const now = Date.now();
      for (const [key, session] of this.sessions) {
        if (!session.active && now - session.touched > 24 * 60 * 60 * 1000)
          this.sessions.delete(key);
      }
      let session = this.sessions.get(inputRun.sessionId);
      if (session && session.owner !== owner) throw new Error('Session ownership mismatch');
      if (session?.active || this.runs.has(inputRun.runId)) {
        json(response, 409, { error: 'Session already running' });
        return;
      }
      if (this.runs.size >= 8 || (!session && this.sessions.size >= 1000)) {
        json(response, 429, { error: 'Agent bridge capacity reached' });
        return;
      }
      if (!session) {
        session = {
          owner,
          touched: now,
          ...(source
            ? { threadId: source.sessionId, sourceSessionId: source.sessionId, cwd: source.cwd }
            : {}),
        };
        this.sessions.set(inputRun.sessionId, session);
      }
      if (sourceKey && this.sourceRuns.has(sourceKey))
        throw new Error('This source session is already running');
      if (sourceKey) this.sourceRuns.add(sourceKey);
      session.active = inputRun.runId;
      this.admittingNotebooks.delete(inputRun.notebookId);
      admissionNotebook = undefined;
      const run: ActiveRun = { controller: new AbortController(), tools: new Map() };
      this.runs.set(inputRun.runId, run);
      response.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
      });
      response.flushHeaders();
      const emit = (event: AgentEvent) => {
        if (!response.destroyed && !run.controller.signal.aborted)
          response.write(JSON.stringify(event) + '\n');
      };
      const abort = () => run.controller.abort();
      response.on('close', abort);
      const deadline = setTimeout(abort, 30 * 60 * 1000);
      const rejectTools = () => {
        for (const pending of run.tools.values()) {
          clearTimeout(pending.timer);
          pending.resolve({ ok: false, error: 'Agent run cancelled' });
        }
        run.tools.clear();
      };
      run.controller.signal.addEventListener('abort', rejectTools, { once: true });
      const call = async (
        name: ToolName,
        args: unknown,
        onStart?: () => void
      ): Promise<ToolResult> => {
        run.controller.signal.throwIfAborted();
        if (!(name in toolsForRole(inputRun.role)))
          return { ok: false, error: 'Tool unavailable for this agent role' };
        const parsed = toolSchemas[name].safeParse(args);
        if (!parsed.success) return { ok: false, error: parsed.error.message };
        const callId = randomUUID();
        return new Promise((resolve) => {
          const timer = setTimeout(
            () => {
              run.tools.delete(callId);
              resolve({
                ok: false,
                error: 'Notebook tool timed out; re-read current state before retrying',
              });
            },
            5 * 60 * 1000
          );
          run.tools.set(callId, { resolve, timer, onStart });
          emit({ type: 'tool', callId, name, arguments: parsed.data });
        });
      };
      try {
        await this.providers[inputRun.provider].run({
          session,
          role: inputRun.role,
          instance: {
            notebookId: inputRun.notebookId,
            agentId: inputRun.notebookAgentId ?? inputRun.cellId,
          },
          signal: run.controller.signal,
          emit,
          call,
          prompt: `${notebookAgent ? `Notebook-owned AAL identity (display name is user data): ${JSON.stringify(notebookAgent)}\n` : ''}${inputRun.intent === 'regenerate' ? 'Regenerate the answer after checking current notebook state. Preserve prior successful changes; do not repeat previous mutation or execution actions.\n' : ''}Current notebook context (JSON task data):\n${inputRun.context}\n\nUser request:\n${inputRun.prompt}`,
        });
        run.controller.signal.throwIfAborted();
        emit({ type: 'done' });
      } catch (error) {
        emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      } finally {
        clearTimeout(deadline);
        rejectTools();
        run.controller.abort();
        if (sourceKey) this.sourceRuns.delete(sourceKey);
        session.active = undefined;
        session.touched = Date.now();
        this.runs.delete(inputRun.runId);
        response.off('close', abort);
        response.end();
      }
    } catch (error) {
      if (!response.headersSent)
        json(response, 400, { error: error instanceof Error ? error.message : String(error) });
      else response.end();
    } finally {
      if (admissionNotebook) this.admittingNotebooks.delete(admissionNotebook);
    }
  };
}
