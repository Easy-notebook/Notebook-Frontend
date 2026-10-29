import { HttpAgentTransport, type AgentTransport } from '@Services/agent-cell/AgentTransport';
import type { AgentProvider } from '@Services/agent-cell/protocol';

/** Writing assistants share the existing agent bridge, but never execute notebook tools. */
export class WritingModelClient {
  constructor(private readonly transport: AgentTransport = new HttpAgentTransport()) {}
  async generate(
    input: {
      notebookId: string;
      cellId: string;
      provider: AgentProvider;
      prompt: string;
      context: string;
    },
    signal: AbortSignal,
    owns: () => boolean
  ): Promise<unknown> {
    const runId = crypto.randomUUID();
    let answer = '';
    await this.transport.run(
      { ...input, runId, sessionId: crypto.randomUUID() },
      signal,
      async (event) => {
        signal.throwIfAborted();
        if (!owns()) throw new Error('Notebook session changed');
        if (event.type === 'text') answer += event.text;
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'tool')
          await this.transport.reply(
            runId,
            event.callId,
            {
              ok: false,
              error: 'Writing suggestions cannot execute tools. Return only the requested JSON.',
            },
            signal
          );
      }
    );
    signal.throwIfAborted();
    if (!owns()) throw new Error('Notebook session changed');
    return JSON.parse(
      answer
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
    );
  }
}
