// @vitest-environment node
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect } from 'vitest';
import { AgentBridge } from './AgentBridge';
import type { AgentRuntime } from './providers/types';
import { HttpAgentTransport } from '../../src/services/agent-cell/AgentTransport';

async function fixture(runtime: AgentRuntime) {
  const bridge = new AgentBridge({ codex: runtime, claude: runtime });
  const server = createServer((request, response) => {
    void bridge.handle(request, response, () => {
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    close: async () => {
      bridge.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
function request() {
  return {
    sessionId: crypto.randomUUID(),
    runId: crypto.randomUUID(),
    notebookId: 'notebook',
    cellId: 'agent',
    provider: 'codex',
    prompt: 'test',
    context: '{}',
  };
}
const post = (origin: string, route: string, value: unknown, signal?: AbortSignal) =>
  fetch(origin + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    signal,
  });

describe('AgentBridge', () => {
  it('round-trips a real HTTP stream and tool result, and resumes only the owned provider session', async () => {
    const seen: Array<string | undefined> = [];
    const f = await fixture({
      run: async (run) => {
        seen.push(run.session.threadId);
        run.session.threadId = 'private-provider-thread';
        run.emit({ type: 'text', text: 'Hello' });
        const result = await run.call('list_cells', {});
        expect(result).toEqual({ ok: true, data: ['code'] });
      },
    });
    const input = request();
    try {
      for (let index = 0; index < 2; index++) {
        input.runId = crypto.randomUUID();
        const response = await post(f.origin, '/agent-api/run', input);
        expect(response.status).toBe(200);
        let buffer = '';
        const events: any[] = [];
        for await (const chunk of response.body!) {
          buffer += new TextDecoder().decode(chunk);
          let newline;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const event = JSON.parse(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            events.push(event);
            if (event.type === 'tool') {
              const claim = { runId: input.runId, callId: event.callId };
              expect((await post(f.origin, '/agent-api/tool-start', claim)).status).toBe(200);
              expect((await post(f.origin, '/agent-api/tool-start', claim)).status).toBe(409);
              expect(
                (
                  await post(f.origin, '/agent-api/tool-start', {
                    ...claim,
                    runId: crypto.randomUUID(),
                  })
                ).status
              ).toBe(409);
              const reply = await post(f.origin, '/agent-api/tool-result', {
                runId: input.runId,
                callId: event.callId,
                result: { ok: true, data: ['code'] },
              });
              expect(reply.status).toBe(200);
              expect(
                (
                  await post(f.origin, '/agent-api/tool-result', {
                    runId: input.runId,
                    callId: event.callId,
                    result: { ok: true },
                  })
                ).status
              ).toBe(409);
            }
          }
        }
        expect(events.map((event) => event.type)).toEqual(['text', 'tool', 'done']);
      }
      expect(seen).toEqual([undefined, 'private-provider-thread']);
      expect(
        (
          await post(f.origin, '/agent-api/run', {
            ...input,
            runId: crypto.randomUUID(),
            notebookId: 'other',
          })
        ).status
      ).toBe(400);
      expect(
        (
          await post(f.origin, '/agent-api/run', {
            ...input,
            runId: crypto.randomUUID(),
            provider: 'claude',
          })
        ).status
      ).toBe(400);
    } finally {
      await f.close();
    }
  });
  it('cancels the provider when the browser disconnects and rejects cross-origin launches', async () => {
    let cancelled!: () => void;
    const observed = new Promise<void>((resolve) => {
      cancelled = resolve;
    });
    const f = await fixture({
      run: async (run) => {
        await new Promise<void>((resolve) =>
          run.signal.addEventListener(
            'abort',
            () => {
              cancelled();
              resolve();
            },
            { once: true }
          )
        );
      },
    });
    try {
      const forbidden = await fetch(f.origin + '/agent-api/run', {
        method: 'POST',
        headers: { Origin: 'https://elsewhere.example', 'Content-Type': 'application/json' },
        body: JSON.stringify(request()),
      });
      expect(forbidden.status).toBe(403);
      const controller = new AbortController();
      const response = await post(f.origin, '/agent-api/run', request(), controller.signal);
      expect(response.status).toBe(200);
      controller.abort();
      await observed;
    } finally {
      await f.close();
    }
  });
  it('detects an interrupted stream in the production client', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response('{"type":"text","text":"partial"}\n', {
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    try {
      const transport = new HttpAgentTransport();
      const events: unknown[] = [];
      await expect(
        transport.run(request() as any, new AbortController().signal, async (event) => {
          events.push(event);
        })
      ).rejects.toThrow('before completion');
      expect(events).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

it('rejects an owned run when native notebook agent identity or provider differs', async () => {
  let runs = 0;
  const bridge = new AgentBridge(
    {
      codex: {
        run: async () => {
          runs++;
        },
      },
      claude: {
        run: async () => {
          runs++;
        },
      },
    },
    {
      readAgent: async () => ({
        notebookId: 'notebook',
        agentId: 'owned',
        name: 'Research',
        provider: 'claude',
        className: 'NotebookWorkspace',
      }),
    } as any
  );
  const server = createServer((req, res) => {
    void bridge.handle(req, res, () => res.end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await post(origin, '/agent-api/run', {
      ...request(),
      notebookAgentId: 'owned',
    });
    expect(response.ok).toBe(false);
    expect(runs).toBe(0);
    const accepted = await post(origin, '/agent-api/run', {
      ...request(),
      provider: 'claude',
      notebookAgentId: 'owned',
    });
    expect(accepted.ok).toBe(true);
    await accepted.text();
    expect(runs).toBe(1);
  } finally {
    bridge.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
