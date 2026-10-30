import { notebookSkillFixture } from '../skills/NotebookSkill.fixture';
import { expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openNotebookMcp } from './NotebookMcpEndpoint';
it('exposes notebook tools through authenticated MCP and forwards mutation approval results', async () => {
  const call = vi.fn().mockResolvedValue({ ok: false, error: 'USER_REJECTED' });
  const endpoint = await openNotebookMcp({
    notebookSkill: notebookSkillFixture(),
    session: {},
    prompt: 'test',
    signal: new AbortController().signal,
    emit: vi.fn(),
    call,
  });
  const client = new Client({ name: 'notebook-test', version: '1' });
  try {
    expect((await fetch(endpoint.config.url, { method: 'POST', body: '{}' })).status).toBe(403);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(endpoint.config.url), {
        requestInit: { headers: endpoint.config.http_headers },
      })
    );
    const catalog = await client.listTools();
    expect(catalog.tools.some((t) => t.name === 'read_notebook')).toBe(true);
    const result = await client.callTool({ name: 'list_cells', arguments: {} });
    expect(call).toHaveBeenCalledWith('list_cells', {});
    expect(result.isError).toBe(true);
  } finally {
    await client.close();
    await endpoint.close();
  }
});
