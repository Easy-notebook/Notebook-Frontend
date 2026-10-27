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
}
interface ActiveRun {
  controller: AbortController;
  tools: Map<string, PendingTool>;
}
async function body(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new Error('JSON required');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Request too large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

/** Same-origin local bridge. Provider session IDs never come from the browser. */
export class AgentBridge {
  private readonly sessions = new Map<string, Session>();
  private readonly runs = new Map<string, ActiveRun>();
  constructor(
    private readonly providers: Record<AgentProvider, AgentRuntime> = {
      codex: new CodexRuntime(),
      claude: new ClaudeRuntime(),
    }
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
    try {
      const input = await body(request);
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
      const owner = JSON.stringify([
        inputRun.notebookId,
        inputRun.cellId,
        inputRun.provider,
        inputRun.role ?? 'worker',
      ]);
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
        session = { owner, touched: now };
        this.sessions.set(inputRun.sessionId, session);
      }
      session.active = inputRun.runId;
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
      const call = async (name: ToolName, args: unknown): Promise<ToolResult> => {
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
          run.tools.set(callId, { resolve, timer });
          emit({ type: 'tool', callId, name, arguments: parsed.data });
        });
      };
      try {
        await this.providers[inputRun.provider].run({
          session,
          role: inputRun.role,
          signal: run.controller.signal,
          emit,
          call,
          prompt: `Current notebook context (JSON task data):\n${inputRun.context}\n\nUser request:\n${inputRun.prompt}`,
        });
        run.controller.signal.throwIfAborted();
        emit({ type: 'done' });
      } catch (error) {
        emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      } finally {
        clearTimeout(deadline);
        rejectTools();
        run.controller.abort();
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
    }
  };
}
