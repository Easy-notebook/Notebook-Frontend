import { describe, it, expect, vi } from 'vitest';
import { NotebookDocumentTools } from './NotebookDocumentTools';
import type { NotebookSnapshot } from '../autoSave/types';
function fixture() {
  const snapshot: NotebookSnapshot = {
    notebookId: 'n',
    notebookTitle: 'Original',
    timestamp: 1,
    tasks: [],
    cells: [
      { id: 'heading', type: 'markdown', content: '# Original' },
      {
        id: 'code',
        type: 'code',
        content: 'print(1)',
        outputs: [],
        metadata: { transcriptRole: 'tool' },
      },
      { id: 'agent', type: 'agent', content: '' },
    ],
  };
  const controller = new AbortController();
  const ports = {
    snapshot: () => snapshot,
    replace: vi.fn((cells) => {
      snapshot.cells = cells;
    }),
    persist: vi.fn(async () => {}),
    artifact: vi.fn(
      async (_operation: string, _input: Record<string, any>, _signal: AbortSignal) => ({
        fileId: crypto.randomUUID(),
        path: '/saved.easynb',
      })
    ),
  };
  const tools = new NotebookDocumentTools(
    ports,
    () => controller.signal.throwIfAborted(),
    controller.signal
  );
  const read = async () => (await tools.execute('read_notebook', {})) as { version: string };
  const backup = async () => {
    const { version } = await read();
    const saved = (await tools.execute('backup_notebook', { version, label: 'original' })) as {
      backupId: string;
    };
    return { version, backupId: saved.backupId };
  };
  return { snapshot, ports, tools, read, backup, controller };
}
describe('versioned notebook organization', () => {
  it('versions canonical cells once, excluding agent streams mirrored in task views', async () => {
    const f = fixture();
    f.snapshot.tasks = [
      {
        id: 't',
        title: 'Task',
        phases: [
          {
            id: 'p',
            title: 'Phase',
            intro: [f.snapshot.cells[2]],
            steps: [{ id: 's', title: 'Step', content: [f.snapshot.cells[2]] }],
          },
        ],
      },
    ];
    const before = await f.read();
    f.snapshot.cells[2].metadata = { agent: { turns: [{ status: 'running' }] } } as any;
    expect((await f.read()).version).toBe(before.version);
    f.snapshot.cells[0].content = 'human edit';
    expect((await f.read()).version).not.toBe(before.version);
  });

  it('requires a successful backup of the exact version; preserves code and outputs', async () => {
    const f = fixture();
    const { version } = await f.read();
    const operations = [{ op: 'update', cellId: 'heading', content: '# Organized' }];
    await expect(
      f.tools.execute('apply_notebook_edits', {
        version,
        backupId: crypto.randomUUID(),
        operations,
      })
    ).rejects.toThrow('BACKUP_REQUIRED');
    const proof = await f.backup();
    const code = f.snapshot.cells[1];
    const result = (await f.tools.execute('apply_notebook_edits', { ...proof, operations })) as {
      version: string;
    };
    expect(f.snapshot.cells[0].content).toBe('# Organized');
    expect(f.snapshot.cells[1]).toBe(code);
    expect(JSON.parse(f.ports.artifact.mock.calls[0][1].content).cells[0].content).toBe(
      '# Original'
    );
    await f.tools.execute('flush_notebook', { version: result.version });
    expect(f.ports.persist).toHaveBeenCalledOnce();
  });
  it('rejects stale revisions even after edit and revert', async () => {
    const f = fixture();
    const proof = await f.backup();
    f.snapshot.cells[0].content = 'changed';
    f.tools.observe();
    f.snapshot.cells[0].content = '# Original';
    f.tools.observe();
    await expect(
      f.tools.execute('apply_notebook_edits', {
        ...proof,
        operations: [{ op: 'update', cellId: 'heading', content: 'new' }],
      })
    ).rejects.toThrow('VERSION_CONFLICT');
    expect(f.ports.replace).not.toHaveBeenCalled();
  });
  it('validates the entire batch before any mutation', async () => {
    const f = fixture();
    const proof = await f.backup();
    await expect(
      f.tools.execute('apply_notebook_edits', {
        ...proof,
        operations: [
          { op: 'update', cellId: 'heading', content: 'new' },
          { op: 'remove', cellId: 'code' },
        ],
      })
    ).rejects.toThrow('Only prose');
    expect(f.snapshot.cells[0].content).toBe('# Original');
    expect(f.ports.replace).not.toHaveBeenCalled();
  });
  it('ignores agent streaming but rejects cancellation and failed backups', async () => {
    const f = fixture();
    const before = await f.read();
    f.snapshot.cells[2].content = 'stream';
    expect((await f.read()).version).toBe(before.version);
    f.ports.artifact.mockRejectedValueOnce(new Error('disk full'));
    await expect(f.backup()).rejects.toThrow('disk full');
    f.controller.abort();
    await expect(f.read()).rejects.toThrow();
  });
});
