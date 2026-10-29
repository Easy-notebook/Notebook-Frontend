import { NotebookArtifactStore } from './NotebookArtifactStore';
import type { Plugin } from 'vite';
import { AgentBridge, nativeProviders } from './AgentBridge';
export function agentBridgePlugin(
  worker?: string,
  target?: string,
  notebookTarget?: string
): Plugin {
  const attach = (server: {
    middlewares: { use: (handler: any) => void };
    httpServer: { once: (event: string, callback: () => void) => unknown } | null;
  }) => {
    const bridge = new AgentBridge(
      nativeProviders(worker, target),
      new NotebookArtifactStore(notebookTarget)
    );
    server.middlewares.use(bridge.handle);
    server.httpServer?.once('close', () => bridge.close());
  };
  return { name: 'notebook-agent-bridge', configureServer: attach, configurePreviewServer: attach };
}
