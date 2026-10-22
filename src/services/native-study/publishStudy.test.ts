import { beforeEach, expect, it, vi } from 'vitest';
import type { NativeView } from './contracts';
import { publishStudy } from './publishStudy';
const io = vi.hoisted(() => ({
  state: {
    notebookId: 'a',
    notebookTitle: 'Research',
    cells: [] as { id: string; content: string }[],
    tasks: [] as unknown[],
    addCell: vi.fn(),
  },
  initialize: vi.fn(async () => {}),
  queueSave: vi.fn(async () => {}),
  flush: vi.fn(async () => {}),
}));
vi.mock('@Store/notebookStore', () => ({
  default: { getState: () => io.state, subscribe: () => () => {} },
}));
vi.mock('@Services/autoSave', () => ({ AutoSaveService: { getInstance: () => io } }));
vi.mock('./studyExport', () => ({ studyMarkdown: () => '## Research\n\nMeasured evidence' }));
const view = { frontend_notebook_id: 'a', document: { id: 'native-a', revision: 4 } } as NativeView;
beforeEach(() => {
  vi.clearAllMocks();
  io.initialize.mockResolvedValue();
  io.flush.mockResolvedValue();
  io.state.notebookId = 'a';
  io.state.cells = [];
  io.state.addCell.mockImplementation((cell) => io.state.cells.push(cell));
});
it('awaits durable save and retries without duplicating the historical snapshot', async () => {
  io.flush.mockRejectedValueOnce(new Error('disk error'));
  await expect(publishStudy(view, 'a')).rejects.toThrow('disk error');
  expect(io.state.cells).toHaveLength(2);
  await publishStudy(view, 'a');
  expect(io.state.cells).toHaveLength(2);
  expect(io.flush).toHaveBeenLastCalledWith('a');
  expect(io.queueSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ notebookId: 'a', cells: io.state.cells })
  );
});
it('rechecks notebook ownership after asynchronous initialization', async () => {
  io.initialize.mockImplementationOnce(async () => {
    io.state.notebookId = 'b';
  });
  await expect(publishStudy(view, 'a')).rejects.toThrow('笔记已切换');
  expect(io.state.addCell).not.toHaveBeenCalled();
  expect(io.queueSave).not.toHaveBeenCalled();
});

it('rejects a snapshot from another notebook before inserting or saving', async () => {
  await expect(publishStudy({ ...view, frontend_notebook_id: 'b' }, 'a')).rejects.toThrow(
    '属于其他笔记'
  );
  expect(io.initialize).not.toHaveBeenCalled();
  expect(io.state.addCell).not.toHaveBeenCalled();
  expect(io.queueSave).not.toHaveBeenCalled();
});
it('preserves edits and refuses to acknowledge a modified snapshot after a failed save', async () => {
  io.flush.mockRejectedValueOnce(new Error('disk error'));
  await expect(publishStudy(view, 'a')).rejects.toThrow('disk error');
  const original = io.state.cells[1].content;
  io.state.cells[1].content = 'My revised interpretation';
  io.queueSave.mockClear();
  await expect(publishStudy(view, 'a')).rejects.toThrow('已被编辑');
  expect(io.state.cells).toHaveLength(2);
  expect(io.state.cells[1].content).toBe('My revised interpretation');
  expect(io.queueSave).not.toHaveBeenCalled();
  io.state.cells[1].content = original;
  await publishStudy(view, 'a');
  expect(io.state.cells).toHaveLength(2);
  expect(io.flush).toHaveBeenLastCalledWith('a');
});
it('validates all existing fragments before inserting any missing fragment', async () => {
  await publishStudy(view, 'a');
  io.state.cells.shift();
  io.state.cells[0].content = 'Edited evidence';
  io.state.addCell.mockClear();
  await expect(publishStudy(view, 'a')).rejects.toThrow('已被编辑');
  expect(io.state.addCell).not.toHaveBeenCalled();
  expect(io.state.cells).toHaveLength(1);
});
