import { createServer } from 'node:http';
import { AgentBridge } from './AgentBridge';
const bridge = new AgentBridge();
const server = createServer((request, response) => {
  void bridge.handle(request, response, () => {
    response.writeHead(404);
    response.end();
  });
});
server.listen(Number(process.env.NOTEBOOK_AGENT_PORT || 8788), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    bridge.close();
    server.close();
  });
