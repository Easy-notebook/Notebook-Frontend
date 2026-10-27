import { describe, it, expect, vi } from 'vitest';
import type { Cell } from '@Store/models';
import { AgentCellSession, type AgentSessionPorts } from './AgentCellSession';
import { newAgentCellData, type AgentEvent, type RunRequest } from './protocol';
import type { AgentTransport } from './AgentTransport';

function fixture(run: AgentTransport['run']) {
  let owner = 'notebook';
  let data = newAgentCellData();
  const cells: Cell[] = [
    { id: 'agent', type: 'agent', content: '' },
    { id: 'code', type: 'code', content: 'original' },
  ];
  const listeners = new Set<() => void>();
  const ports: AgentSessionPorts = {
    notebookId: () => owner,
    cells: () => cells,
    load: () => data,
    save: vi.fn((value) => {
      data = value;
      for (const listener of listeners) listener();
    }),
    watch: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: vi.fn(),
    run: vi.fn(),
    cancel: vi.fn(),
    busy: () => false,
    summary: (text, cellIds) => {
      data = { ...data, summary: { text, cellIds, updatedAt: 'now' } };
    },
  };
  const transport = { run: vi.fn(run), reply: vi.fn(async () => {}) };
  const session = new AgentCellSession('notebook', 'agent', ports, transport);
  return {
    session,
    ports,
    transport,
    listeners,
    data: () => data,
    switchNotebook: () => {
      owner = 'other';
      for (const listener of listeners) listener();
    },
  };
}
describe('AgentCellSession', () => {
  it('streams answers, deduplicates tool execution and preserves a summary on follow-up', async () => {
    const callId = crypto.randomUUID();
    const f = fixture(async (_request, _signal, emit) => {
      await emit({ type: 'text', text: 'Hello ' });
      await emit({ type: 'text', text: 'world' });
      const call: AgentEvent = {
        type: 'tool',
        callId,
        name: 'summary',
        arguments: { text: 'Saved findings', cellIds: ['code'] },
      };
      await emit(call);
      await emit(call);
      await emit({ type: 'done' });
    });
    await f.session.send('First');
    expect(f.data().turns[0]).toMatchObject({ answer: 'Hello world', status: 'completed' });
    expect(f.data().turns[0].actions).toHaveLength(1);
    expect(f.data().summary?.text).toBe('Saved findings');
    await f.session.send('Next');
    const requests = f.transport.run.mock.calls.map((call) => call[0]);
    expect(requests[0].sessionId).toBe(requests[1].sessionId);
    expect(requests[0].runId).not.toBe(requests[1].runId);
    expect(JSON.parse(requests[1].context).summary.text).toBe('Saved findings');
    expect(f.listeners.size).toBe(0);
  });
  it('serializes turns and cancels without accepting late writes', async () => {
    let emit!: (event: AgentEvent) => Promise<void>;
    let finish!: () => void;
    const f = fixture(async (_request, _signal, callback) => {
      emit = callback;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const pending = f.session.send('First');
    await f.session.send('Ignored');
    expect(f.transport.run).toHaveBeenCalledTimes(1);
    f.session.cancel();
    await expect(emit({ type: 'text', text: 'late' })).rejects.toThrow();
    finish();
    await pending;
    expect(f.data().turns[0].status).toBe('cancelled');
    expect(f.data().turns[0].answer).toBe('');
    expect(f.listeners.size).toBe(0);
  });
  it('does not save or execute in another notebook after switching', async () => {
    let emit!: (event: AgentEvent) => Promise<void>;
    let finish!: () => void;
    const f = fixture(async (_request, _signal, callback) => {
      emit = callback;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const pending = f.session.send('First');
    f.switchNotebook();
    const saves = vi.mocked(f.ports.save).mock.calls.length;
    await expect(
      emit({
        type: 'tool',
        callId: crypto.randomUUID(),
        name: 'run_cell',
        arguments: { cellId: 'code', version: 'x' },
      })
    ).rejects.toThrow();
    finish();
    await pending;
    expect(f.ports.save).toHaveBeenCalledTimes(saves);
    expect(f.ports.run).not.toHaveBeenCalled();
  });
  it('marks provider errors as failed while retaining partial output', async () => {
    const f = fixture(async (_request: RunRequest, _signal, emit) => {
      await emit({ type: 'text', text: 'Partial' });
      await emit({ type: 'error', message: 'Provider unavailable' });
    });
    await f.session.send('First');
    expect(f.data().turns[0]).toMatchObject({
      answer: 'Partial',
      status: 'failed',
      error: 'Provider unavailable',
    });
  });
});
