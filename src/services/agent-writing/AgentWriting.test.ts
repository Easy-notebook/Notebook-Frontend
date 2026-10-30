import { afterEach, describe, expect, it } from 'vitest';
import { AgentWriting, agentWriting, focusedWritingIds } from './AgentWriting';
import useStore from '@Store/notebookStore';
import { NotebookAgentTools, type NotebookAgentPorts } from '../agent-cell/NotebookAgentTools';
import type { Cell } from '@Store/models';
const identity = {
  notebookId: 'writing-reservations',
  ownerId: 'writer',
  name: 'Claude',
  color: '#d87b59',
};
const cells: Cell[] = [
  { id: 'agent', type: 'agent', content: '' },
  { id: 'body', type: 'markdown', content: 'Original' },
  { id: 'other', type: 'code', content: 'print(1)', language: 'python' },
];
afterEach(() => {
  for (const item of agentWriting.snapshot()) agentWriting.finish(item.id);
});
describe('writing reservations', () => {
  it('keeps all reservations but focuses only the latest node per author, prioritizing approval', () => {
    const writing = new AgentWriting();
    const first = writing.propose(identity, 'body', 'Plan first');
    const next = writing.propose(identity, 'other', 'Plan second');
    const outline = writing.propose(identity, 'pending', '', 'Pending heading');
    writing.outline(outline.id);
    expect([...focusedWritingIds(writing.snapshot())]).toEqual([next.id]);
    const detach = writing.bindApproval([first.id], { resolve: () => {} });
    expect([...focusedWritingIds(writing.snapshot())]).toEqual([first.id]);
    detach();
    const another = writing.propose({ ...identity, ownerId: 'another' }, 'independent', 'Work');
    expect([...focusedWritingIds(writing.snapshot())]).toEqual([next.id, another.id]);
    expect(writing.snapshot()).toHaveLength(4);
  });
  it('isolates ownership and notebooks; stale cleanup cannot unlock a later operation', () => {
    const writing = new AgentWriting();
    const first = writing.propose(identity, 'body', 'Rewrite');
    expect(() => writing.propose({ ...identity, ownerId: 'other' }, 'body', 'Conflicting')).toThrow(
      'LOCKED'
    );
    expect(() =>
      writing.propose({ ...identity, notebookId: 'another' }, 'body', 'Independent')
    ).not.toThrow();
    writing.finish(first.id);
    const second = writing.propose({ ...identity, ownerId: 'other' }, 'body', 'Rewrite');
    writing.finish(first.id);
    expect(writing.forCell(identity.notebookId, 'body')?.id).toBe(second.id);
  });
  it('rejects edits, removal, reordering and type changes, but allows unrelated writes and outputs', () => {
    const writing = new AgentWriting();
    writing.propose(identity, 'body', 'Rewrite');
    for (const next of [
      cells.filter((c) => c.id !== 'body'),
      [cells[0], cells[2], cells[1]],
      cells.map((c) => (c.id === 'body' ? { ...c, content: 'Oops' } : c)),
      cells.map((c) => (c.id === 'body' ? { ...c, type: 'code' as const } : c)),
    ])
      expect(() => writing.assertMutation(identity.notebookId, cells, next)).toThrow('LOCKED');
    expect(() =>
      writing.assertMutation(
        identity.notebookId,
        cells,
        cells.map((c) => (c.id === 'other' ? { ...c, content: 'print(2)' } : c))
      )
    ).not.toThrow();
    expect(() =>
      writing.assertMutation(
        identity.notebookId,
        cells,
        cells.map((c) => ({ ...c, outputs: [] }))
      )
    ).not.toThrow();
  });
  it('revokes synchronous commit authority after a failed write', () => {
    const writing = new AgentWriting();
    const op = writing.propose(identity, 'body', 'Rewrite');
    expect(() =>
      writing.commit([op.id], () => {
        throw new Error('Storage failed');
      })
    ).toThrow('Storage failed');
    expect(writing.snapshot()).toEqual([]);
    const next = writing.propose({ ...identity, ownerId: 'new' }, 'body', 'Retry');
    expect(() => writing.commit([op.id], () => {})).toThrow('expired');
    expect(writing.snapshot()[0].id).toBe(next.id);
  });
  it('protects store actions and bulk setState while allowing an owner commit', () => {
    useStore.setState({ notebookId: identity.notebookId, cells, isInitialized: false });
    const op = agentWriting.propose(identity, 'body', 'Rewrite');
    expect(() => useStore.getState().updateCell('body', 'Oops')).toThrow('LOCKED');
    expect(() => useStore.setState({ cells: cells.filter((c) => c.id !== 'body') })).toThrow(
      'LOCKED'
    );
    useStore.getState().updateCell('other', 'print(3)');
    agentWriting.commit([op.id], () => useStore.getState().updateCell('body', 'Written'));
    expect(useStore.getState().cells.find((c) => c.id === 'body')?.content).toBe('Written');
    expect(agentWriting.snapshot()).toEqual([]);
  });
});
function toolsFixture(withDocument = false) {
  useStore.setState({ notebookId: identity.notebookId, cells, isInitialized: false });
  const controller = new AbortController();
  const ports: NotebookAgentPorts = {
    notebookId: () => useStore.getState().notebookId,
    cells: () => useStore.getState().cells,
    watch: (listener) => useStore.subscribe(listener),
    update: (id, content) => useStore.getState().updateCell(id, content),
    run: async () => {},
    cancel: async () => {},
    busy: () => false,
    summary: () => {},
  };
  if (withDocument)
    ports.document = {
      snapshot: () => ({
        notebookId: identity.notebookId,
        notebookTitle: '',
        cells: useStore.getState().cells,
        tasks: useStore.getState().tasks,
        timestamp: 0,
      }),
      replace: (next) => useStore.getState().setCells(next),
      persist: async () => {},
      artifact: async () => ({ fileId: crypto.randomUUID(), path: '/test-backup.easynb' }),
    };
  const tools = new NotebookAgentTools(
    identity.notebookId,
    'agent',
    ports,
    controller.signal,
    'worker',
    identity
  );
  void tools.execute('read_cell', { cellId: 'body' });
  const version = tools.index().find((cell) => cell.cellId === 'body')!.version;
  return { tools, controller, version };
}
describe('real tool writes', () => {
  it('previews and approves an insertion in context without rewriting surrounding source', async () => {
    const { tools } = toolsFixture();
    const source = '# 方法\n\n第一段。\n\n结论保持不变。';
    useStore.getState().updateCell('body', source);
    void tools.execute('read_cell', { cellId: 'body' });
    const version = tools.index().find((cell) => cell.cellId === 'body')!.version;
    const insertion = { anchor: '第一段。', position: 'after' };
    const fragment = '\n\n**新增论证**与 $x^2$。';
    const args = { cellId: 'body', version, insertion };
    expect(
      (await tools.execute('propose_cell_edit', { ...args, intent: '补充论证', draft: fragment }))
        .ok
    ).toBe(true);
    const expected = source.replace('第一段。', '第一段。' + fragment);
    expect(agentWriting.snapshot()[0].draft).toBe(expected);
    expect(useStore.getState().cells[1].content).toBe(source);
    expect(tools.prepareWriting('update_cell', { ...args, content: fragment })).toBeUndefined();
    expect(agentWriting.snapshot()[0].draft).toBe(expected);
    expect((await tools.execute('update_cell', { ...args, content: fragment })).ok).toBe(true);
    expect(useStore.getState().cells[1]).toMatchObject({
      id: 'body',
      type: 'markdown',
      content: expected,
    });
    expect(agentWriting.snapshot()).toEqual([]);
    expect((await tools.execute('update_cell', { ...args, content: fragment })).error).toContain(
      'VERSION_CONFLICT'
    );
    expect(useStore.getState().cells[1].content).toBe(expected);
    tools.dispose();
  });
  it('does not reserve or alter a cell when the insertion anchor is ambiguous', async () => {
    const { tools } = toolsFixture();
    useStore.getState().updateCell('body', '重复。重复。');
    await tools.execute('read_cell', { cellId: 'body' });
    const args = {
      cellId: 'body',
      version: tools.index().find((cell) => cell.cellId === 'body')!.version,
      insertion: { anchor: '重复。', position: 'after' },
      content: '新增',
    };
    expect(tools.prepareWriting('update_cell', args)?.error).toContain('ANCHOR_AMBIGUOUS');
    expect((await tools.execute('update_cell', args)).error).toContain('ANCHOR_AMBIGUOUS');
    expect(agentWriting.snapshot()).toEqual([]);
    expect(useStore.getState().cells[1].content).toBe('重复。重复。');
    tools.dispose();
  });
  it('previews a draft without persisting it, commits through the reservation, then unlocks', async () => {
    const { tools, version } = toolsFixture();
    expect(
      (
        await tools.execute('propose_cell_edit', {
          cellId: 'body',
          version,
          intent: 'Expand the method',
          draft: 'Working draft',
        })
      ).ok
    ).toBe(true);
    expect(agentWriting.snapshot()[0].phase).toBe('generating');
    expect(useStore.getState().cells[1].content).toBe('Original');
    expect(() => useStore.getState().updateCell('body', 'User overwrite')).toThrow('LOCKED');
    expect(
      (await tools.execute('update_cell', { cellId: 'body', version, content: 'Completed method' }))
        .ok
    ).toBe(true);
    expect(agentWriting.snapshot()).toEqual([]);
    expect(useStore.getState().cells[1].content).toBe('Completed method');
    tools.dispose();
  });
  it.each(['abort', 'dispose', 'switch', 'cancel'] as const)(
    'releases reservations on %s',
    async (reason) => {
      const { tools, version, controller } = toolsFixture();
      await tools.execute('propose_cell_edit', {
        cellId: 'body',
        version,
        intent: 'Rewrite',
        stage: 'planned',
      });
      expect(agentWriting.snapshot()[0].phase).toBe('proposed');
      if (reason === 'abort') controller.abort();
      if (reason === 'dispose') tools.dispose();
      if (reason === 'switch') useStore.setState({ notebookId: 'another' });
      if (reason === 'cancel') await tools.execute('cancel_cell_edit', { cellId: 'body' });
      expect(agentWriting.snapshot()).toEqual([]);
      tools.dispose();
    }
  );
  it('cleans up a failed commit and rejects a competing writer without releasing the first writer', async () => {
    const { tools, version } = toolsFixture();
    await tools.execute('propose_cell_edit', { cellId: 'body', version, intent: 'Rewrite' });
    const op = agentWriting.snapshot()[0];
    expect(() =>
      agentWriting.propose({ ...identity, ownerId: 'competing' }, 'body', 'Other')
    ).toThrow('LOCKED');
    expect(agentWriting.snapshot()[0].id).toBe(op.id);
    const result = await tools.execute('update_cell', {
      cellId: 'body',
      version: 'stale',
      content: 'Oops',
    });
    expect(result.ok).toBe(false);
    expect(agentWriting.snapshot()).toEqual([]);
    tools.dispose();
  });
});

it('commits a backed-up batch including an insertion anchored to an agent cell', async () => {
  const { tools } = toolsFixture(true);
  const read = await tools.execute('read_notebook', {});
  const { version } = read.data as { version: string };
  const backup = await tools.execute('backup_notebook', { version, label: 'Before writing' });
  const { backupId } = backup.data as { backupId: string };
  const input = {
    version,
    backupId,
    operations: [
      { op: 'update', cellId: 'body', content: 'Updated method' },
      { op: 'insert', afterCellId: 'agent', content: 'Inserted explanation' },
    ],
  };
  expect(tools.prepareWriting('apply_notebook_edits', input)).toBeUndefined();
  expect(agentWriting.snapshot()).toHaveLength(2);
  const result = await tools.execute('apply_notebook_edits', input);
  expect(result).toMatchObject({ ok: true });
  expect(agentWriting.snapshot()).toEqual([]);
  expect(useStore.getState().cells.some((cell) => cell.content === 'Updated method')).toBe(true);
  expect(useStore.getState().cells[1].content).toBe('Inserted explanation');
  tools.dispose();
});
it('rejecting one proposal keeps the same writer’s other reserved cell intact', async () => {
  const { tools, version } = toolsFixture();
  await tools.execute('propose_cell_edit', { cellId: 'body', version, intent: 'Rewrite' });
  await tools.execute('read_cell', { cellId: 'other' });
  const otherVersion = tools.index().find((cell) => cell.cellId === 'other')!.version;
  await tools.execute('propose_cell_edit', {
    cellId: 'other',
    version: otherVersion,
    intent: 'Rewrite code',
  });
  tools.rejectWriting('update_cell', { cellId: 'body', version, content: 'Rejected' });
  expect(agentWriting.forCell(identity.notebookId, 'body')).toBeUndefined();
  expect(agentWriting.forCell(identity.notebookId, 'other')).toBeDefined();
  tools.dispose();
});

it('creates all outline reservations before returning and expands only the selected node', async () => {
  const { tools } = toolsFixture(true);
  const read = await tools.execute('read_notebook', {});
  const { version } = read.data as { version: string };
  const backup = await tools.execute('backup_notebook', { version, label: 'Outline' });
  const { backupId } = backup.data as { backupId: string };
  const result = await tools.execute('apply_notebook_edits', {
    version,
    backupId,
    outline: true,
    operations: [
      { op: 'insert', afterCellId: 'body', content: '## Two' },
      { op: 'insert', afterCellId: 'body', content: '## One' },
    ],
  });
  expect(result.ok).toBe(true);
  const planned = agentWriting.snapshot();
  expect(planned).toHaveLength(2);
  expect(planned.every((op) => op.outline && op.phase === 'proposed')).toBe(true);
  const target = planned[0];
  expect(() => useStore.getState().updateCell(target.cellId, 'manual')).toThrow('LOCKED');
  await tools.execute('read_cell', { cellId: target.cellId });
  const cellVersion = tools.index().find((cell) => cell.cellId === target.cellId)!.version;
  await tools.execute('propose_cell_edit', {
    cellId: target.cellId,
    version: cellVersion,
    intent: 'Expand',
    draft: '## Two\n\nContent',
  });
  expect(agentWriting.forCell(identity.notebookId, target.cellId)?.outline).toBe(true);
  let complete!: () => void;
  const detach = agentWriting.present(
    target.id,
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  const commit = tools.execute('update_cell', {
    cellId: target.cellId,
    version: cellVersion,
    content: '## Two\n\nContent',
  });
  await Promise.resolve();
  expect(useStore.getState().cells.find((cell) => cell.id === target.cellId)?.content).toBe(
    target.draft
  );
  complete();
  expect((await commit).ok).toBe(true);
  expect(agentWriting.snapshot()).toHaveLength(1);
  detach();
  tools.dispose();
  expect(agentWriting.snapshot()).toEqual([]);
});
