import { eventSchema, type AgentEvent, type RunRequest, type ToolResult } from './protocol';

export interface AgentTransport {
  run(
    request: RunRequest,
    signal: AbortSignal,
    onEvent: (event: AgentEvent) => Promise<void>
  ): Promise<void>;
  reply(runId: string, callId: string, result: ToolResult, signal: AbortSignal): Promise<void>;
}
export class HttpAgentTransport implements AgentTransport {
  async run(
    request: RunRequest,
    signal: AbortSignal,
    onEvent: (event: AgentEvent) => Promise<void>
  ) {
    const response = await fetch('/agent-api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) throw new Error(await response.text());
    if (!response.body) throw new Error('Agent stream unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let terminal = false;
    const accept = async (line: string) => {
      if (!line.trim()) return;
      if (terminal) throw new Error('Agent event after completion');
      const event = eventSchema.parse(JSON.parse(line));
      terminal = event.type === 'done' || event.type === 'error';
      await onEvent(event);
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        signal.throwIfAborted();
        buffer += decoder.decode(value, { stream: !done });
        if (buffer.length > 2_000_000) throw new Error('Agent event exceeds stream limit');
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          await accept(line);
        }
        if (done) {
          await accept(buffer);
          break;
        }
      }
      if (!terminal)
        throw new Error('Agent connection ended before completion; partial work is retained');
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  async reply(runId: string, callId: string, result: ToolResult, signal: AbortSignal) {
    const response = await fetch('/agent-api/tool-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, callId, result }),
      signal,
    });
    if (!response.ok) throw new Error(`Tool result delivery failed: ${await response.text()}`);
  }
}
