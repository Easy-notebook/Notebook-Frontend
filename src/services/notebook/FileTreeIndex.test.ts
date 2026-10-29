import { expect, it } from 'vitest';
import { FileTreeIndex } from './FileTreeIndex';
it('preserves unrelated subtree identity, sorts names and prunes empty directories', () => {
  const index = new FileTreeIndex();
  const file = (path: string, revision = 1) => ({
    path,
    name: path.split('/').pop()!,
    revision,
    type: 'file',
    size: 1,
  });
  index.set(file('/source/original'));
  index.set(file('/work/z'));
  index.set(file('/work/a'));
  const first = index.snapshot();
  index.set(file('/work/a', 2));
  const second = index.snapshot();
  expect(second[0]).toBe(first[0]);
  expect(second[1]).not.toBe(first[1]);
  expect(second[1]).toMatchObject({ children: [{ name: 'a', revision: 2 }, { name: 'z' }] });
  index.remove('/work/a');
  index.remove('/work/z');
  expect(index.snapshot()).toEqual([first[0]]);
});

it('retains explicit empty folders and their capabilities when the last child is removed', () => {
  const index = new FileTreeIndex();
  index.set({
    name: 'notes',
    path: '/notes',
    type: 'directory',
    size: 0,
    revision: 1,
    creatable: true,
    removable: true,
  });
  index.set({
    name: 'a',
    path: '/notes/a',
    type: 'file',
    size: 1,
    revision: 2,
    creatable: true,
    removable: true,
  });
  index.remove('/notes/a');
  expect(index.snapshot()).toMatchObject([
    { path: '/notes', type: 'directory', creatable: true, removable: true, children: [] },
  ]);
  index.remove('/notes');
  expect(index.snapshot()).toEqual([]);
});
