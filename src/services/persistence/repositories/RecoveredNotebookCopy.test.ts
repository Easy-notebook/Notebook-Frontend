import { expect, it } from 'vitest';
import { RecoveredNotebookCopy } from './RecoveredNotebookCopy';
import type { NotebookRecoveryRecord } from '../interfaces';

const data = {
  notebook_id: 'source',
  title: 'Original',
  cells: [{ id: 'a', type: 'code', content: '你好', outputs: [{ type: 'text', content: 'kept' }] }],
  tasks: [{ id: 'task', custom: true }],
  extra: { retained: true },
  metadata: { custom: 'value' },
};
const draft = (content: string): NotebookRecoveryRecord => ({
  id: 'draft',
  notebookId: 'source',
  writerId: 'writer',
  revision: 1,
  reason: 'content_changed',
  expectedContent: null,
  content,
  createdAt: 1,
  updatedAt: 1,
});

it('creates a separate identity while preserving cells, tasks, outputs and extra data', () => {
  const original = draft(JSON.stringify(data));
  const copy = new RecoveredNotebookCopy(original, 'copy', 1000);
  const restored = JSON.parse(copy.file.content!.content);
  expect(restored).toMatchObject({
    ...data,
    notebook_id: 'copy',
    title: 'Original (Recovered)',
    notebookTitle: 'Original (Recovered)',
    saved_at: 1000,
  });
  expect(restored.metadata).toMatchObject({ custom: 'value', totalCells: 1 });
  expect(copy.file.metadata).toMatchObject({
    notebookId: 'copy',
    filePath: 'notebook_copy.json',
    storageType: 'local',
  });
  expect(copy.notebook).toMatchObject({
    id: 'copy',
    retention: 'persistent',
    fileCount: 1,
    totalSize: new TextEncoder().encode(copy.file.content!.content).byteLength,
  });
  expect(original.content).toBe(JSON.stringify(data));
});

it.each(['source', ''])('rejects an unsafe destination identity %j', (id) => {
  expect(() => new RecoveredNotebookCopy(draft(JSON.stringify(data)), id)).toThrow(
    'new notebook identity'
  );
});

it.each([
  'bad json',
  'null',
  JSON.stringify({ ...data, notebook_id: 'other' }),
  JSON.stringify({ ...data, cells: null }),
  JSON.stringify({ ...data, tasks: {} }),
  JSON.stringify({ ...data, cells: [null] }),
  JSON.stringify({ ...data, metadata: 'bad' }),
])('rejects malformed recovery content %s', (content) => {
  expect(() => new RecoveredNotebookCopy(draft(content), 'copy')).toThrow();
});
