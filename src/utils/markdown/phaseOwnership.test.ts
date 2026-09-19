import { expect, it } from 'vitest';
import { resolvePhaseOwnership } from './phaseOwnership';
import type { Task } from '@Store/models/task';

it('matches last-writer interval semantics for randomized overlapping and clipped ranges', () => {
  let seed = 19;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  for (let run = 0; run < 100; run++) {
    const expected: (string | null)[] = new Array(50).fill(null);
    const tasks: Task[] = [{ id: 'task', title: 'Task', phases: [] }];
    for (let range = 0; range < 100; range++) {
      const start = (random() % 90) - 20,
        end = (random() % 90) - 20;
      const id = String(range);
      tasks[0].phases.push({
        id,
        title: id,
        steps: [{ id, title: id, startIndex: start, endIndex: end }],
      });
      for (let index = Math.max(0, start); index <= end && index < 50; index++)
        expected[index] = id;
    }
    expect(resolvePhaseOwnership(50, tasks)).toEqual(expected);
  }
});

it('handles many fully overlapping ranges without changing their precedence', () => {
  const tasks: Task[] = [
    {
      id: 'task',
      title: 'Task',
      phases: Array.from({ length: 10000 }, (_, i) => ({
        id: String(i),
        title: 'Phase',
        steps: [{ id: 'step', title: 'Step', startIndex: 0, endIndex: 9999 }],
      })),
    },
  ];
  expect(resolvePhaseOwnership(10000, tasks)).toEqual(new Array(10000).fill('9999'));
});
