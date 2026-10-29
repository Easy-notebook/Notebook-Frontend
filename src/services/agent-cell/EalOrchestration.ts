import { executionSpanSchema } from './protocol';
import { z } from 'zod';
/** Daemon-owned mission operations; aborting an HTTP read is not mission cancellation. */
export class EalOrchestration {
  private async request(operation: string, input: unknown, signal?: AbortSignal) {
    const response = await fetch(`/agent-api/eal/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'EAL request failed');
    return result;
  }
  /** Emits daemon observations; observer_end is not a terminal execution state. */
  async *watch(trace: string, signal?: AbortSignal): AsyncGenerator<Record<string, unknown>> {
    const response = await fetch('/agent-api/eal/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trace }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error('Unable to subscribe to EAL trace');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        if (pending.length > 1024 * 1024) throw new Error('EAL event buffer exceeded');
        let boundary: number;
        while ((boundary = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, boundary);
          pending = pending.slice(boundary + 1);
          if (!line.trim()) continue;
          const event = z.object({ event: z.string() }).passthrough().parse(JSON.parse(line));
          if (event.event === 'observer_error') throw new Error(String(event.error));
          yield event;
        }
        if (done) {
          if (pending.trim()) throw new Error('Truncated EAL event');
          break;
        }
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
  compile(source: string, signal?: AbortSignal) {
    return this.request('compile', { source }, signal);
  }
  run(source: string) {
    return this.request('run', { source });
  }
  cancel(runId: string) {
    return this.request('cancel', { runId });
  }
  async trace(runId: string, signal?: AbortSignal) {
    return z
      .object({ document: z.unknown(), spans: z.array(executionSpanSchema) })
      .parse(await this.request('trace', { runId }, signal));
  }
}
