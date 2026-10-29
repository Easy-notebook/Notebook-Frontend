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
  const transport = { start: vi.fn(async () => {}), run: vi.fn(run), reply: vi.fn(async () => {}) };
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
  it('upserts real spans without mutating previously published snapshots', async () => {
    vi.useFakeTimers();
    try {
      let before: unknown;
      const f = fixture(async (_request, _signal, emit) => {
        const span = {
          id: 'native',
          runtime: 'aal' as const,
          name: 'Agent.run',
          startedAt: 10,
          status: 'running' as const,
        };
        await emit({ type: 'span', span });
        await vi.advanceTimersByTimeAsync(80);
        before = f.data().turns[0].spans;
        await emit({ type: 'span', span: { ...span, status: 'done', endedAt: 20 } });
      });
      await f.session.send('Run');
      expect(f.data().turns[0].spans).toHaveLength(1);
      expect(f.data().turns[0].spans?.[0].status).toBe('done');
      expect(before).toMatchObject([{ status: 'running' }]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('shares unchanged action snapshots across text publications', async () => {
    vi.useFakeTimers();
    try {
      const snapshots: unknown[] = [];
      const f = fixture(async (_request, _signal, emit) => {
        await emit({ type: 'activity', id: 'a', label: 'read', status: 'completed' });
        await vi.advanceTimersByTimeAsync(80);
        snapshots.push(f.data().turns[0].actions);
        await emit({ type: 'text', text: 'More text' });
        await vi.advanceTimersByTimeAsync(80);
        snapshots.push(f.data().turns[0].actions);
      });
      await f.session.send('Read');
      expect(snapshots[0]).toBe(snapshots[1]);
    } finally {
      vi.useRealTimers();
    }
  });
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

describe('live approvals', () => {
  it('pauses before mutation and consumes the exact approval only once', async () => {
    const callId = crypto.randomUUID();
    const f = fixture(async (request, _signal, emit) => {
      const version = JSON.parse(request.context).cells.find(
        (cell: { cellId: string }) => cell.cellId === 'code'
      ).version;
      await emit({
        type: 'tool',
        callId,
        name: 'update_cell',
        arguments: { cellId: 'code', version, content: 'approved' },
      });
    });
    const pending = f.session.send('edit');
    await vi.waitFor(() => expect(f.data().turns[0].actions[0]?.status).toBe('waiting'));
    expect(f.ports.update).not.toHaveBeenCalled();
    const turn = f.data().turns[0];
    expect(() => f.session.resolve('wrong', turn.id, callId, 'approve')).toThrow('ownership');
    f.session.resolve(f.data().sessionId, turn.id, callId, 'approve');
    expect(() => f.session.resolve(f.data().sessionId, turn.id, callId, 'approve')).toThrow(
      'no longer'
    );
    await pending;
    expect(f.ports.update).toHaveBeenCalledExactlyOnceWith('code', 'approved');
    expect(f.transport.start).toHaveBeenCalledTimes(1);
    expect(f.data().turns[0].actions[0]).toMatchObject({ status: 'completed', kind: 'tool' });
    expect(f.data().turns[0].endedAt).toBeGreaterThanOrEqual(f.data().turns[0].startedAt!);
  });
  it.each(['reject', 'cancel', 'switch'] as const)(
    '%s does not execute the waiting tool',
    async (mode) => {
      const callId = crypto.randomUUID();
      const f = fixture(async (request, _signal, emit) => {
        const version = JSON.parse(request.context).cells.find(
          (cell: { cellId: string }) => cell.cellId === 'code'
        ).version;
        await emit({
          type: 'tool',
          callId,
          name: 'update_cell',
          arguments: { cellId: 'code', version, content: 'blocked' },
        });
      });
      const pending = f.session.send('edit');
      await vi.waitFor(() => expect(f.data().turns[0].actions[0]?.status).toBe('waiting'));
      if (mode === 'reject')
        f.session.resolve(f.data().sessionId, f.data().turns[0].id, callId, 'reject');
      else if (mode === 'cancel') f.session.cancel();
      else f.switchNotebook();
      await pending;
      expect(f.ports.update).not.toHaveBeenCalled();
      expect(f.transport.start).not.toHaveBeenCalled();
      if (mode === 'reject') expect(f.data().turns[0].actions[0].status).toBe('rejected');
      if (mode === 'cancel')
        expect(f.data().turns[0]).toMatchObject({
          status: 'cancelled',
          actions: [{ status: 'cancelled' }],
        });
    }
  );
  it('rechecks version after approval rather than overwriting an intervening edit', async () => {
    const callId = crypto.randomUUID();
    const f = fixture(async (request, _signal, emit) => {
      const version = JSON.parse(request.context).cells.find(
        (cell: { cellId: string }) => cell.cellId === 'code'
      ).version;
      await emit({
        type: 'tool',
        callId,
        name: 'update_cell',
        arguments: { cellId: 'code', version, content: 'stale' },
      });
    });
    const pending = f.session.send('edit');
    await vi.waitFor(() => expect(f.data().turns[0].actions[0]?.status).toBe('waiting'));
    (f.ports.cells()[1] as Cell).content = 'manual change';
    for (const listener of f.listeners) listener();
    f.session.resolve(f.data().sessionId, f.data().turns[0].id, callId, 'approve');
    await pending;
    expect(f.ports.update).not.toHaveBeenCalled();
    expect(JSON.stringify(f.data().turns[0].actions[0].result)).toContain('VERSION_CONFLICT');
  });
  it('does not mutate when the bridge refuses an expired tool', async () => {
    const callId = crypto.randomUUID();
    const f = fixture(async (request, _signal, emit) => {
      const version = JSON.parse(request.context).cells.find(
        (cell: { cellId: string }) => cell.cellId === 'code'
      ).version;
      await emit({
        type: 'tool',
        callId,
        name: 'update_cell',
        arguments: { cellId: 'code', version, content: 'stale' },
      });
    });
    f.transport.start.mockRejectedValueOnce(new Error('expired'));
    const pending = f.session.send('edit');
    await vi.waitFor(() => expect(f.data().turns[0].actions[0]?.status).toBe('waiting'));
    f.session.resolve(f.data().sessionId, f.data().turns[0].id, callId, 'approve');
    await pending;
    expect(f.ports.update).not.toHaveBeenCalled();
    expect(f.data().turns[0].status).toBe('failed');
  });
});
