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
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => io.state } }));
vi.mock('@Services/autoSave', () => ({ AutoSaveService: { getInstance: () => io } }));
vi.mock('./studyExport', () => ({ studyMarkdown: () => '## Research\n\nMeasured evidence' }));
const view = { document: { id: 'native-a', revision: 4 } } as NativeView;
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
