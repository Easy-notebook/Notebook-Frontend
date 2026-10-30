import { describe, it, expect, vi } from 'vitest';
import type { Cell } from '@Store/models';
import { NotebookAgentTools, type NotebookAgentPorts } from './NotebookAgentTools';

function fixture() {
  let owner = 'notebook';
  let cells: Cell[] = [
    { id: 'agent', type: 'agent', content: '' },
    { id: 'code', type: 'code', content: '1 + 1', language: 'python' },
  ];
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const controller = new AbortController();
  const ports: NotebookAgentPorts = {
    notebookId: () => owner,
    cells: () => cells,
    watch: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: vi.fn((id, content) => {
      cells = cells.map((cell) => (cell.id === id ? { ...cell, content } : cell));
      notify();
    }),
    run: vi.fn(async () => ({ success: true })),
    cancel: vi.fn(async () => ({ success: true })),
    busy: () => false,
    summary: vi.fn(),
  };
  const tools = new NotebookAgentTools('notebook', 'agent', ports, controller.signal);
  return {
    tools,
    ports,
    controller,
    notify,
    listeners,
    switchNotebook: () => {
      owner = 'another';
      notify();
    },
    remove: (id: string) => {
      cells = cells.filter((cell) => cell.id !== id);
      notify();
    },
  };
}

describe('NotebookAgentTools', () => {
  it('requires current detail reads for proposals, direct writes and batch writes', async () => {
    const f = fixture();
    const version = f.tools.index()[1].version;
    const args = { cellId: 'code', version, content: 'new' };
    expect(f.tools.index()[1]).toMatchObject({ lineNumber: 2, preview: '1 + 1' });
    expect((await f.tools.execute('update_cell', args)).error).toContain('DETAIL_READ_REQUIRED');
    expect(f.tools.prepareWriting('update_cell', args)?.error).toContain('DETAIL_READ_REQUIRED');
    expect(
      (await f.tools.execute('propose_cell_edit', { cellId: 'code', version, intent: 'edit' }))
        .error
    ).toContain('DETAIL_READ_REQUIRED');
    expect(
      f.tools.prepareWriting('apply_notebook_edits', {
        version: 'document',
        backupId: crypto.randomUUID(),
        operations: [{ op: 'update', cellId: 'code', content: 'new' }],
      })?.error
    ).toContain('DETAIL_READ_REQUIRED');
    expect(await f.tools.execute('read_cell', { cellId: 'code' })).toMatchObject({
      ok: true,
      data: { documentLineNumber: 2, content: '1 + 1', lines: [{ lineNumber: 1, text: '1 + 1' }] },
    });
    f.ports.update('code', 'human change');
    const fresh = f.tools.index()[1].version;
    expect((await f.tools.execute('update_cell', { ...args, version: fresh })).error).toContain(
      'DETAIL_READ_REQUIRED'
    );
    await f.tools.execute('read_cell', { cellId: 'code' });
    expect((await f.tools.execute('update_cell', { ...args, version: fresh })).ok).toBe(true);
    f.tools.dispose();
  });
  it('isolates curator privileges from ordinary notebook agents', async () => {
    const f = fixture();
    f.ports.curateContext = vi.fn();
    const curator = new NotebookAgentTools(
      'notebook',
      'agent',
      f.ports,
      f.controller.signal,
      'curator'
    );
    const args = { cellId: 'code', version: curator.index()[1].version, content: 'changed' };
    expect((await curator.execute('update_cell', args)).ok).toBe(false);
    expect((await curator.execute('run_cell', args)).ok).toBe(false);
    expect((await f.tools.execute('curate_context', {})).ok).toBe(false);
    expect(f.ports.update).not.toHaveBeenCalled();
    expect(f.ports.run).not.toHaveBeenCalled();
    expect(f.ports.curateContext).not.toHaveBeenCalled();
    curator.dispose();
    f.tools.dispose();
  });
  it('reads the complete ordered index and rejects stale writes including edit-and-revert', async () => {
    const f = fixture();
    expect(f.tools.index().map((cell) => cell.cellId)).toEqual(['agent', 'code']);
    const version = f.tools.index()[1].version;
    f.ports.update('code', '2 + 2');
    f.ports.update('code', '1 + 1');
    const result = await f.tools.execute('update_cell', {
      cellId: 'code',
      version,
      content: 'overwrite',
    });
    expect(result.error).toContain('VERSION_CONFLICT');
    expect(f.ports.cells()[1].content).toBe('1 + 1');
    await f.tools.execute('read_cell', { cellId: 'code' });
    const fresh = f.tools.index()[1].version;
    expect(
      (await f.tools.execute('update_cell', { cellId: 'code', version: fresh, content: '3 + 3' }))
        .ok
    ).toBe(true);
    expect(f.ports.cells()[1].content).toBe('3 + 3');
    f.tools.dispose();
  });
  it('returns execution evidence and does not toggle an already running manual cell', async () => {
    const f = fixture();
    f.ports.busy = () => true;
    const args = { cellId: 'code', version: f.tools.index()[1].version };
    expect((await f.tools.execute('run_cell', args)).error).toContain('busy');
    expect(f.ports.run).not.toHaveBeenCalled();
    f.ports.busy = () => false;
    expect(await f.tools.execute('run_cell', args)).toMatchObject({
      ok: true,
      data: { result: { success: true }, cellId: 'code' },
    });
    f.tools.dispose();
    expect(f.ports.cancel).not.toHaveBeenCalled();
  });
  it('marks failed kernel execution as a failed action with evidence', async () => {
    const f = fixture();
    f.ports.run = vi.fn(async () => ({ success: false, error: 'SyntaxError' }));
    expect(
      await f.tools.execute('run_cell', { cellId: 'code', version: f.tools.index()[1].version })
    ).toMatchObject({ ok: false, error: 'SyntaxError', data: { result: { success: false } } });
    f.tools.dispose();
  });
  it('cancels only its own pending execution and rejects late results', async () => {
    const f = fixture();
    let finish!: (value: unknown) => void;
    f.ports.run = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const result = f.tools.execute('run_cell', {
      cellId: 'code',
      version: f.tools.index()[1].version,
    });
    f.controller.abort();
    expect(f.ports.cancel).toHaveBeenCalledWith('code');
    expect((await result).ok).toBe(false); // cancellation does not wait for a non-cancellable backend
    finish({ success: true });
    f.tools.dispose();
    expect(f.listeners.size).toBe(0);
  });
  it('blocks cross-notebook access, deleted owners and cancelled writes', async () => {
    const f = fixture();
    f.switchNotebook();
    expect((await f.tools.execute('read_cell', { cellId: 'code' })).ok).toBe(false);
    f.tools.dispose();
    const g = fixture();
    g.remove('agent');
    expect((await g.tools.execute('summary', { text: 'summary', cellIds: [] })).ok).toBe(false);
    g.tools.dispose();
    const h = fixture();
    h.controller.abort();
    expect(
      (await h.tools.execute('update_cell', { cellId: 'code', version: 'old', content: 'bad' })).ok
    ).toBe(false);
    expect(h.ports.update).not.toHaveBeenCalled();
    h.tools.dispose();
  });
  it('persists summaries with verified references and leaves cells intact', async () => {
    const f = fixture();
    expect(
      (await f.tools.execute('summary', { text: 'Computed the result', cellIds: ['code'] })).ok
    ).toBe(true);
    expect(f.ports.summary).toHaveBeenCalledWith('Computed the result', ['code']);
    expect((await f.tools.execute('summary', { text: 'bad', cellIds: ['missing'] })).ok).toBe(
      false
    );
    expect(f.ports.summary).toHaveBeenCalledTimes(1);
    f.tools.dispose();
  });
});
