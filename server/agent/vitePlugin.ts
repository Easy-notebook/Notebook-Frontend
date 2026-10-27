import type { Plugin } from 'vite';
import { AgentBridge } from './AgentBridge';
export function agentBridgePlugin(): Plugin {
  const attach = (server: {
    middlewares: { use: (handler: any) => void };
    httpServer: { once: (event: string, callback: () => void) => unknown } | null;
  }) => {
    const bridge = new AgentBridge();
    server.middlewares.use(bridge.handle);
    server.httpServer?.once('close', () => bridge.close());
  };
  return { name: 'notebook-agent-bridge', configureServer: attach, configurePreviewServer: attach };
}
