import { expect, it } from 'vitest';
import { preserveTaskProgress } from './taskProgress';
import type { Task } from './task';

it('retains progress only for matching identities without replacing derived content or ranges', () => {
  const previous: Task[] = [
    {
      id: 'task',
      title: 'Old',
      phases: [
        {
          id: 'phase',
          title: 'Old phase',
          status: 'running',
          icon: 'custom',
          steps: [{ id: 'same', title: 'Old step', status: 'completed', endIndex: 3 }],
        },
      ],
    },
  ];
  const next: Task[] = [
    {
      id: 'task',
      title: 'New',
      phases: [
        {
          id: 'phase',
          title: 'New phase',
          status: 'pending',
          steps: [
            { id: 'same', title: 'New step', status: 'pending', endIndex: 8 },
            { id: 'new', title: 'Added', status: 'pending' },
          ],
        },
      ],
    },
  ];
  expect(preserveTaskProgress(next, previous)).toBe(next);
  expect(next[0].phases[0]).toMatchObject({
    title: 'New phase',
    status: 'running',
    icon: 'custom',
  });
  expect(next[0].phases[0].steps[0]).toMatchObject({
    title: 'New step',
    status: 'completed',
    endIndex: 8,
  });
  expect(next[0].phases[0].steps[1].status).toBe('pending');
  expect(previous[0].phases[0].steps[0].endIndex).toBe(3);
});
