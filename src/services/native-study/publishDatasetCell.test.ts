import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { publishDatasetCell } from './publishDatasetCell';
import {
  publishComparisonCell,
  publishComparisonWorkflow,
  publishEvidenceCell,
} from './publishComparisonCell';
import { NativeDatasetClient } from './NativeDatasetClient';

const io = vi.hoisted(() => ({
  state: {
    notebookId: 'a',
    notebookTitle: 'Research',
    tasks: [],
    cells: [] as {
      id: string;
      content: string;
      type: string;
      language?: string;
      metadata?: unknown;
    }[],
    addCell: vi.fn(),
  },
  listeners: new Set<(value: { notebookId: string }) => void>(),
  initialize: vi.fn(),
  queueSave: vi.fn(),
  flush: vi.fn(),
}));
vi.mock('@Store/notebookStore', () => ({
  default: {
    getState: () => io.state,
    subscribe: (listener: (value: { notebookId: string }) => void) => {
      io.listeners.add(listener);
      return () => io.listeners.delete(listener);
    },
  },
}));
vi.mock('@Services/autoSave', () => ({ AutoSaveService: { getInstance: () => io } }));
const dataset = { name: '房屋.csv', version: 'a'.repeat(64), sha256: 'b'.repeat(64), size: 12 };
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  io.state.notebookId = 'a';
  io.state.cells = [];
  io.listeners.clear();
  io.initialize.mockResolvedValue(undefined);
  io.queueSave.mockResolvedValue(undefined);
  io.flush.mockResolvedValue(undefined);
  io.state.addCell.mockImplementation((cell) => io.state.cells.push(cell));
});
afterEach(() => vi.unstubAllGlobals());
it('inserts a pinned AAL cell once and awaits persistence on every retry', async () => {
  io.flush.mockRejectedValueOnce(new Error('storage failed'));
  await expect(publishDatasetCell('a', dataset, ['area', 'rooms'], 3)).rejects.toThrow(
    'storage failed'
  );
  expect(io.state.cells).toHaveLength(1);
  expect(io.state.cells[0]).toMatchObject({
    type: 'code',
    language: 'aal',
    metadata: { nativeDataset: { ...dataset, columns: ['area', 'rooms'], clusters: 3 } },
  });
  expect(io.state.cells[0].content).toContain(`version = "${dataset.version}"`);
  await publishDatasetCell('a', dataset, ['area', 'rooms'], 3);
  expect(io.state.cells).toHaveLength(1);
  expect(io.flush).toHaveBeenCalledTimes(2);
  await publishDatasetCell('a', dataset, ['area'], 2);
  expect(io.state.cells).toHaveLength(2);
  expect(io.listeners.size).toBe(0);
});
it('does not overwrite an edited generated cell or report it as newly published', async () => {
  await publishDatasetCell('a', dataset, ['area'], 2);
  io.state.cells[0].content = 'User code';
  io.queueSave.mockClear();
  await expect(publishDatasetCell('a', dataset, ['area'], 2)).rejects.toThrow('已被编辑');
  expect(io.state.cells[0].content).toBe('User code');
  expect(io.queueSave).not.toHaveBeenCalled();
});
it('leaving and returning to the same notebook during initialization cancels insertion', async () => {
  io.initialize.mockImplementationOnce(async () => {
    for (const id of ['b', 'a']) {
      io.state.notebookId = id;
      for (const listener of io.listeners) listener(io.state);
    }
  });
  await expect(publishDatasetCell('a', dataset, ['area'], 2)).rejects.toThrow('context changed');
  expect(io.state.cells).toHaveLength(0);
  expect(io.queueSave).not.toHaveBeenCalled();
  expect(io.listeners.size).toBe(0);
});
it('panel disposal before durable insertion cannot publish even if initialization later succeeds', async () => {
  const controller = new AbortController();
  io.initialize.mockImplementationOnce(async () => controller.abort());
  await expect(publishDatasetCell('a', dataset, ['area'], 2, controller.signal)).rejects.toThrow();
  expect(io.state.cells).toHaveLength(0);
  expect(io.listeners.size).toBe(0);
});
it('retains the old notebook save but does not acknowledge success after navigation during flush', async () => {
  io.flush.mockImplementationOnce(async () => {
    io.state.notebookId = 'b';
    for (const listener of io.listeners) listener(io.state);
  });
  await expect(publishDatasetCell('a', dataset, ['area'], 2)).rejects.toThrow('笔记已切换');
  expect(io.queueSave).toHaveBeenCalledWith(expect.objectContaining({ notebookId: 'a' }));
  expect(io.state.cells).toHaveLength(1);
});

const comparisonInput = {
  referenceCsv: 'area,rooms\n40,2',
  queryCsv: 'area,rooms\n41,2',
  columns: ['area', 'rooms'],
  clusters: 3,
  neighbors: 2,
};
function mockArchive() {
  return vi
    .spyOn(NativeDatasetClient.prototype, 'upload')
    .mockImplementation(async (name, csv) => ({
      name,
      csv,
      version: (name.includes('reference') ? 'a' : 'c').repeat(64),
      sha256: 'b'.repeat(64),
      size: csv.length,
    }));
}
it('archives both frozen inputs before publishing, retries partial uploads, and protects edits', async () => {
  const upload = mockArchive();
  upload.mockImplementationOnce(async (name, csv) => ({ ...dataset, name, csv }));
  upload.mockRejectedValueOnce(new Error('query upload failed'));
  await expect(publishComparisonCell('a', comparisonInput)).rejects.toThrow('query upload failed');
  expect(io.state.cells).toHaveLength(0);
  expect(io.queueSave).not.toHaveBeenCalled();
  io.flush.mockRejectedValueOnce(new Error('save failed'));
  await expect(publishComparisonCell('a', comparisonInput)).rejects.toThrow('save failed');
  const cell = io.state.cells[0];
  expect(cell).toMatchObject({
    type: 'code',
    language: 'aal',
    metadata: { nativeComparison: { neighbors: 2, columns: ['area', 'rooms'] } },
  });
  expect(JSON.stringify(cell.metadata)).not.toContain(comparisonInput.referenceCsv);
  await publishComparisonCell('a', comparisonInput);
  expect(io.state.cells).toHaveLength(1);
  cell.content = 'user edits';
  await expect(publishComparisonCell('a', comparisonInput)).rejects.toThrow('已被编辑');
  expect(cell.content).toBe('user edits');
});
it('freezes query and settings before asynchronous archival and changes identity with settings', async () => {
  const upload = mockArchive();
  const input = { ...comparisonInput, columns: [...comparisonInput.columns] };
  const inserting = publishComparisonCell('a', input);
  input.queryCsv = 'changed';
  input.neighbors = 8;
  input.columns[0] = 'changed';
  await inserting;
  expect(upload.mock.calls[1].slice(0, 2)).toEqual(['housing-query.csv', comparisonInput.queryCsv]);
  expect(io.state.cells[0].content).toContain('csv, query, 2, report.reference_id');
  expect(io.state.cells[0].content).toContain('["area", "rooms"]');
  await publishComparisonCell('a', { ...comparisonInput, neighbors: 1 });
  expect(io.state.cells).toHaveLength(2);
});
it('cancels between uploads on away-and-back navigation even if the first upload ignores abort', async () => {
  const upload = mockArchive();
  upload.mockImplementationOnce(async (name, csv, signal) => {
    for (const id of ['b', 'a']) {
      io.state.notebookId = id;
      for (const listener of io.listeners) listener(io.state);
    }
    expect(signal?.aborted).toBe(true);
    return { ...dataset, name, csv };
  });
  await expect(publishComparisonCell('a', comparisonInput)).rejects.toThrow('context changed');
  expect(upload).toHaveBeenCalledTimes(1);
  expect(io.state.cells).toHaveLength(0);
  expect(io.listeners.size).toBe(0);
});
it('validates all comparison settings before archiving and cancels on panel disposal', async () => {
  const upload = mockArchive();
  await expect(publishComparisonCell('a', { ...comparisonInput, neighbors: 9 })).rejects.toThrow(
    '近邻'
  );
  await expect(publishComparisonCell('a', { ...comparisonInput, queryCsv: ' ' })).rejects.toThrow(
    'CSV'
  );
  expect(upload).not.toHaveBeenCalled();
  const controller = new AbortController();
  upload.mockImplementationOnce(async (name, csv) => {
    controller.abort();
    return { ...dataset, name, csv };
  });
  await expect(publishComparisonCell('a', comparisonInput, controller.signal)).rejects.toThrow();
  expect(upload).toHaveBeenCalledTimes(1);
  expect(io.state.cells).toHaveLength(0);
});

it('publishes one reusable producer for multiple queries and retains edited producer source', async () => {
  const upload = mockArchive();
  await publishComparisonWorkflow('a', comparisonInput);
  expect(io.state.cells).toHaveLength(2);
  const [producer, consumer] = io.state.cells;
  expect(producer.content).toContain('self.skill("notebook_set"');
  expect(consumer.content).toContain('self.skill("notebook_get"');
  expect(consumer.content).not.toContain('numeric_segments');
  expect(producer.metadata).toEqual(consumer.metadata);
  upload.mockImplementation(async (name, csv) => ({
    name,
    csv,
    version: (name.includes('reference') ? 'a' : 'd').repeat(64),
    sha256: 'b'.repeat(64),
    size: csv.length,
  }));
  await publishComparisonWorkflow('a', { ...comparisonInput, queryCsv: 'area,rooms\n90,4' });
  expect(io.state.cells).toHaveLength(3);
  expect(io.state.cells[2].metadata).toEqual(producer.metadata);
  producer.content = 'edited reference';
  await expect(publishComparisonWorkflow('a', comparisonInput)).rejects.toThrow('已被编辑');
  expect(producer.content).toBe('edited reference');
});

it('persists executable evidence separately from comparison, retries save and preserves edits', async () => {
  mockArchive();
  await publishComparisonCell('a', comparisonInput);
  io.flush.mockRejectedValueOnce(new Error('save failed'));
  await expect(publishEvidenceCell('a', comparisonInput)).rejects.toThrow('save failed');
  expect(io.state.cells).toHaveLength(2);
  const cell = io.state.cells[1];
  expect(cell.id).toMatch(/^aal-evidence-/);
  expect(cell.content).toContain('knowledge.fact(');
  expect(cell.content).toContain('knowledge.reason(');
  expect(cell.metadata).toEqual(io.state.cells[0].metadata);
  await publishEvidenceCell('a', comparisonInput);
  expect(io.state.cells).toHaveLength(2);
  cell.content = 'owned edits';
  await expect(publishEvidenceCell('a', comparisonInput)).rejects.toThrow('已被编辑');
  expect(cell.content).toBe('owned edits');
});
