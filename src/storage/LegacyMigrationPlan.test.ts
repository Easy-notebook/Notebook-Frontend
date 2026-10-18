import { expect, it } from 'vitest';
import { LegacyMigrationPlan } from './LegacyMigrationPlan';

const file = (notebookId = 'book') => ({ notebookId, path: 'a', name: 'a', content: '你好' });

it('derives absent UTF8 size and metadata without changing valid empty text or zero values', () => {
  const plan = new LegacyMigrationPlan(
    [
      file(),
      { ...file('empty'), content: '', size: 0, cachedAt: 0, lastAccessed: 0, accessCount: 0 },
    ],
    1000
  );
  expect(plan.errors).toEqual([]);
  expect(plan.batches[0].files[0]).toMatchObject({
    content: '你好',
    size: 6,
    lastModified: new Date(1000).toISOString(),
  });
  expect(plan.batches[1].files[0]).toMatchObject({ content: '', size: 0 });
  expect(plan.batches[1].notebook).toMatchObject({ lastAccessedAt: 0, accessCount: 0 });
});

it.each([
  { content: undefined },
  { content: null },
  { content: false },
  { content: 0 },
  { path: '' },
  { name: 1 },
  { size: -1 },
  { size: NaN },
  { size: '3' },
  { accessCount: 0.5 },
  { cachedAt: Infinity },
  { lastAccessed: null },
  { lastModified: '' },
])('rejects the whole affected notebook for invalid fields %j', (invalid) => {
  const plan = new LegacyMigrationPlan([
    file(),
    { ...file(), path: 'b', ...invalid },
    file('valid'),
  ]);
  expect(plan.filesFound).toBe(3);
  expect(plan.notebooksFound).toBe(2);
  expect(plan.errors).toHaveLength(1);
  expect(plan.batches.map((batch) => batch.notebook.id)).toEqual(['valid']);
});

it('reports unidentifiable records without discarding independent valid notebooks', () => {
  const plan = new LegacyMigrationPlan([null, 1, [], {}, { notebookId: 12 }, file()]);
  expect(plan.errors).toHaveLength(5);
  expect(plan.notebooksFound).toBe(1);
  expect(plan.filesFound).toBe(6);
  expect(plan.batches).toHaveLength(1);
});

it('preserves valid historical logical sizes and captures source values', () => {
  const source = { ...file(), size: 100, lastModified: 'historical', cachedAt: 50, accessCount: 3 };
  const plan = new LegacyMigrationPlan([source]);
  source.content = 'later';
  source.size = 1;
  expect(plan.batches[0].files[0]).toMatchObject({
    content: '你好',
    size: 100,
    lastModified: 'historical',
  });
  expect(plan.batches[0].notebook).toMatchObject({ lastAccessedAt: 50, accessCount: 3 });
});
