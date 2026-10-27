import { expect, it, vi } from 'vitest';
import { OutputProjection } from './OutputProjection';

it.each(['text', 'error', 'html'])('preserves falsy values and explicit keys for %s', (type) => {
  const projection = new OutputProjection();
  const values = projection.project([
    { type, content: 0, key: 0 },
    { type, content: false, key: '' },
  ]);
  expect(values[0].key).toBe(0);
  expect(values[1].key).toBe('');
  expect(String(values[0].content)).toBe('0');
  expect(String(values[1].content)).toBe('false');
});

it('reuses both the output list and existing entries when appending immutable outputs', () => {
  const projection = new OutputProjection();
  const toJSON = vi.fn(() => ({ image: 'payload' }));
  const image = { type: 'image', content: { toJSON } };
  const source = [image];
  const first = projection.project(source);
  expect(projection.project(source)).toBe(first);
  const appended = projection.project([...source, { type: 'text', content: 'next' }]);
  expect(appended[0]).toBe(first[0]);
  expect(appended[0].key).toBe(first[0].key);
  expect(toJSON).toHaveBeenCalledOnce();
  expect(appended).toHaveLength(2);
});

it('projects replacements, filters invalid entries and clears the current list', () => {
  const projection = new OutputProjection();
  const first = projection.project([{ type: 'text', content: 'before', key: 'stable' }]);
  const next = projection.project([null, 42, { type: 'text', content: 'after', key: 'stable' }]);
  expect(next).toEqual([{ type: 'text', content: 'after', key: 'stable' }]);
  expect(next[0]).not.toBe(first[0]);
  expect(projection.project(undefined)).toEqual([]);
});
