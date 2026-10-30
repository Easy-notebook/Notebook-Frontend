import { notebookTools } from '../skills/NotebookSkill';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toolDescriptions, type ToolName } from '../../../src/services/agent-cell/protocol';
import type { ProviderRun } from './types';
/** Per-run loopback tools; possession of its random bearer is scoped to this run only. */
export async function openNotebookMcp(run: ProviderRun) {
  const token = randomBytes(32).toString('hex');
  let active = 0;
  const connections = new Set<McpServer>();
  const server = createServer(async (req, res) => {
    if (
      req.headers.authorization !== `Bearer ${token}` ||
      req.headers.origin ||
      req.url !== '/mcp'
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    if (active >= 8 || run.signal.aborted) {
      res.writeHead(429);
      res.end();
      return;
    }
    active++;
    const mcp = new McpServer({ name: 'notebook', version: '1.0.0' });
    connections.add(mcp);
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2_000_000) throw new Error('MCP input too large');
        chunks.push(Buffer.from(chunk));
      }
      for (const [name, schema] of Object.entries(notebookTools(run)))
        mcp.registerTool(
          name,
          { description: toolDescriptions[name as ToolName], inputSchema: schema.shape },
          async (args: unknown) => {
            const result = await run.call(name as ToolName, args);
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result) }],
              isError: !result.ok,
            };
          }
        );
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end();
    } finally {
      active--;
      connections.delete(mcp);
      await mcp.close();
    }
  });
  server.requestTimeout = 30000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    config: {
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`,
      http_headers: { Authorization: `Bearer ${token}` },
      tool_timeout_sec: 1800,
    },
    close: async () => {
      for (const mcp of connections) await mcp.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
