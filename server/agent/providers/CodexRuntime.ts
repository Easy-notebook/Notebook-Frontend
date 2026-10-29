import { z } from 'zod';
import {
  toolSchemas,
  toolsForRole,
  toolDescriptions,
  toolNameSchema,
} from '../../../src/services/agent-cell/protocol';
import { instructionsForRole, type AgentRuntime, type ProviderRun } from './types';
import { CodexConnection } from './CodexConnection';
import { openNotebookMcp } from './NotebookMcpEndpoint';

/** Resumes the provider-owned thread; notebook identity and authority remain at the bridge. */
export class CodexRuntime implements AgentRuntime {
  async run(run: ProviderRun): Promise<void> {
    run.signal.throwIfAborted();
    const rpc = new CodexConnection();
    let settled = false;
    let finish!: (error?: Error) => void;
    const completion = new Promise<void>((resolve, reject) => {
      finish = (error) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };
    });
    void completion.catch(() => {});
    rpc.onError = finish;
    const abort = () => {
      finish(new Error('Agent run cancelled'));
      rpc.close();
    };
    run.signal.addEventListener('abort', abort, { once: true });
    rpc.onMessage = (message) => {
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
            rpc.send({
              id: message.id,
              result: {
                success: result.ok,
                contentItems: [{ type: 'inputText', text: JSON.stringify(result) }],
              },
            });
        })();
      } else if (message.id !== undefined)
        rpc.send({
          id: message.id,
          error: { code: -32601, message: 'Only notebook tools are supported by this client' },
        });
      else if (p?.threadId && p.threadId !== run.session.threadId) return;
      else if (message.method === 'thread/tokenUsage/updated' && p.tokenUsage?.last)
        run.emit({
          type: 'usage',
          usage: {
            inputTokens: p.tokenUsage.last.inputTokens,
            outputTokens: p.tokenUsage.last.outputTokens,
          },
        });
      else if (message.method === 'item/agentMessage/delta')
        run.emit({ type: 'text', text: p.delta });
      else if (
        (message.method === 'item/started' || message.method === 'item/completed') &&
        p.item &&
        !['agentMessage', 'userMessage', 'reasoning', 'dynamicToolCall'].includes(p.item.type)
      )
        run.emit({
          type: 'activity',
          id: p.item.id,
          label: p.item.type,
          status: message.method === 'item/started' ? 'running' : 'completed',
          detail: JSON.stringify(p.item),
        });
      else if (message.method === 'error' && !p.willRetry)
        finish(new Error(p.error?.message || 'Codex run failed'));
      else if (message.method === 'turn/completed')
        finish(
          p.turn.status === 'completed'
            ? undefined
            : new Error(p.turn.error?.message || `Codex turn ${p.turn.status}`)
        );
    };
    let mcp: Awaited<ReturnType<typeof openNotebookMcp>> | undefined;
    try {
      await rpc.initialize();
      const options = {
        approvalPolicy: 'never',
        sandbox: 'read-only',
        developerInstructions: instructionsForRole(run.role),
        ...(run.session.cwd ? { cwd: run.session.cwd } : {}),
      };
      if (run.session.threadId) {
        mcp = await openNotebookMcp(run);
        const result = await rpc.request('thread/resume', {
          ...options,
          threadId: run.session.threadId,
          excludeTurns: true,
          config: { 'mcp_servers.notebook': mcp.config },
        });
        if (result.thread.id !== run.session.threadId)
          throw new Error('Resumed Codex session identity mismatch');
      } else {
        const result = await rpc.request('thread/start', {
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
      await rpc.request('turn/start', {
        threadId: run.session.threadId,
        input: [{ type: 'text', text: run.prompt }],
      });
      await completion;
    } finally {
      run.signal.removeEventListener('abort', abort);
      rpc.close();
      await mcp?.close();
    }
  }
}
