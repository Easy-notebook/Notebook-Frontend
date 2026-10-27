import { expect, it } from 'vitest';
import { Book } from 'lucide-react';
import { NotebookSaveQueue } from './NotebookSaveQueue';
import type { NotebookSnapshot } from './types';
it('saves actual derived phase icons as presentation-free owned data', () => {
  const input: NotebookSnapshot = {
    notebookId: 'a',
    notebookTitle: 'Research',
    cells: [],
    timestamp: 1,
    tasks: [
      {
        id: 't',
        title: 'task',
        phases: [
          { id: 'p', title: 'phase', steps: [], icon: Book },
          { id: 'q', title: 'other', steps: [], icon: 'book' },
        ],
      },
    ],
  };
  const queue = new NotebookSaveQueue();
  const saved = queue.enqueue(input);
  expect(saved.tasks[0].phases[0]).not.toHaveProperty('icon');
  expect(saved.tasks[0].phases[1].icon).toBe('book');
  expect(input.tasks[0].phases[0].icon).toBe(Book);
  input.tasks[0].title = 'later';
  expect(saved.tasks[0].title).toBe('task');
});
it('still rejects non-cloneable notebook content without replacing an accepted snapshot', () => {
  const queue = new NotebookSaveQueue();
  const input: NotebookSnapshot = {
    notebookId: 'a',
    notebookTitle: 'Research',
    cells: [],
    tasks: [],
    timestamp: 1,
  };
  const accepted = queue.enqueue(input);
  expect(() =>
    queue.enqueue({
      ...input,
      cells: [{ id: 'x', type: 'markdown', content: 'x', metadata: { value: () => {} } }],
    })
  ).toThrow();
  expect(queue.get('a')).toBe(accepted);
});
