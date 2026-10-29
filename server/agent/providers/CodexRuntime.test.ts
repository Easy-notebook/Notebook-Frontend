import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requests: [] as any[],
  close: vi.fn(),
  mcpClose: vi.fn(),
  mismatch: false,
}));
vi.mock('./CodexConnection', () => ({
  CodexConnection: class {
    onMessage = (m: any) => {};
    onError = (e: Error) => {};
    async initialize() {}
    send() {}
    close() {
      mocks.close();
    }
    async request(method: string, params: any) {
      mocks.requests.push({ method, params });
      if (method === 'thread/resume')
        return { thread: { id: mocks.mismatch ? 'other' : params.threadId } };
      if (method === 'thread/start') return { thread: { id: 'new' } };
      if (method === 'turn/start') {
        queueMicrotask(() =>
          this.onMessage({
            method: 'turn/completed',
            params: { threadId: params.threadId, turn: { status: 'completed' } },
          })
        );
        return {};
      }
    }
  },
}));
vi.mock('./NotebookMcpEndpoint', () => ({
  openNotebookMcp: async () => ({
    config: { url: 'http://127.0.0.1:12345/mcp' },
    close: mocks.mcpClose,
  }),
}));
import { CodexRuntime } from './CodexRuntime';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requests = [];
  mocks.mismatch = false;
});
const run = () => ({
  session: { threadId: 'original', sourceSessionId: 'original', cwd: '/original/project' },
  prompt: 'continue',
  signal: new AbortController().signal,
  emit: vi.fn(),
  call: vi.fn(),
});
it('resumes the exact thread and cwd with notebook MCP without creating a fork/new thread', async () => {
  await new CodexRuntime().run(run());
  expect(mocks.requests[0]).toMatchObject({
    method: 'thread/resume',
    params: {
      threadId: 'original',
      cwd: '/original/project',
      sandbox: 'read-only',
      config: { 'mcp_servers.notebook': { url: 'http://127.0.0.1:12345/mcp' } },
    },
  });
  expect(mocks.requests.map((r) => r.method)).toEqual(['thread/resume', 'turn/start']);
  expect(mocks.mcpClose).toHaveBeenCalled();
});
it('fails closed when resume returns another thread', async () => {
  mocks.mismatch = true;
  await expect(new CodexRuntime().run(run())).rejects.toThrow('identity mismatch');
  expect(mocks.requests.map((r) => r.method)).toEqual(['thread/resume']);
  expect(mocks.mcpClose).toHaveBeenCalled();
});
