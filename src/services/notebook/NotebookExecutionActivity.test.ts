import { expect, it, vi } from 'vitest';
import { NotebookExecutionActivity } from './NotebookExecutionActivity';
function setup() {
  let notebookId = 'a';
  const observers = new Set<() => void>();
  const publish = vi.fn();
  const activity = new NotebookExecutionActivity({
    notebookId: () => notebookId,
    watch: (check) => {
      observers.add(check);
      return () => {
        observers.delete(check);
      };
    },
    publish,
  });
  return {
    activity,
    publish,
    observers,
    navigate: (id: string) => {
      notebookId = id;
      observers.forEach((check) => check());
    },
  };
}
it('retains busy state until every independent owner releases', () => {
  const f = setup();
  const workflow = f.activity.acquire();
  const batch = f.activity.acquire();
  workflow.release();
  expect(f.publish).toHaveBeenLastCalledWith(true);
  expect(batch.isCurrent()).toBe(true);
  batch.release();
  expect(f.publish).toHaveBeenLastCalledWith(false);
  expect(f.observers.size).toBe(0);
});
it('invalidates old owners across away-and-back navigation without releasing a new owner', () => {
  const f = setup();
  const old = f.activity.acquire();
  f.navigate('b');
  f.navigate('a');
  const current = f.activity.acquire();
  old.release();
  expect(old.isCurrent()).toBe(false);
  expect(current.isCurrent()).toBe(true);
  expect(f.publish).toHaveBeenLastCalledWith(true);
  current.release();
});
it('makes release idempotent', () => {
  const f = setup();
  const owner = f.activity.acquire();
  owner.release();
  f.publish.mockClear();
  owner.release();
  expect(f.publish).not.toHaveBeenCalled();
});
