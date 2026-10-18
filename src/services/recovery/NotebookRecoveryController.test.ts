import { expect, it, vi } from 'vitest';
import { NotebookRecoveryController } from './NotebookRecoveryController';
import type { NotebookRecoveryRecord } from '../persistence/interfaces';

function setup() {
  const repository = {
    saveDraft: vi.fn(),
    listDrafts: vi.fn().mockResolvedValue([]),
    discardDraft: vi.fn().mockResolvedValue(true),
  };
  return { repository, controller: new NotebookRecoveryController(repository) };
}
const draft = (revision: number) => ({ id: 'draft', revision }) as NotebookRecoveryRecord;

it('ignores a delayed older refresh result', async () => {
  const { repository, controller } = setup();
  let finish!: (value: NotebookRecoveryRecord[]) => void;
  repository.listDrafts
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce([draft(2)]);
  const first = controller.refresh();
  await controller.refresh();
  finish([draft(1)]);
  await first;
  expect(controller.getSnapshot().drafts).toEqual([draft(2)]);
});

it('deletion invalidates pending reads and captures the reviewed revision', async () => {
  const { repository, controller } = setup();
  let finish!: (value: NotebookRecoveryRecord[]) => void;
  repository.listDrafts.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const reading = controller.refresh();
  const reviewed = draft(2);
  const deleting = controller.discard(reviewed);
  reviewed.revision = 3;
  await deleting;
  finish([draft(1)]);
  await reading;
  expect(repository.discardDraft).toHaveBeenCalledExactlyOnceWith('draft', 2);
  expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', drafts: [] });
});

it('refreshes a newer copy after a stale dismissal without trying to delete it again', async () => {
  const { repository, controller } = setup();
  repository.discardDraft.mockResolvedValue(false);
  repository.listDrafts.mockResolvedValue([draft(3)]);
  await controller.discard(draft(2));
  expect(repository.discardDraft).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    drafts: [draft(3)],
    notice: expect.stringContaining('changed'),
  });
});

it('retains displayed drafts on delete failure and permits a later refresh', async () => {
  const { repository, controller } = setup();
  repository.listDrafts.mockResolvedValue([draft(1)]);
  await controller.refresh();
  repository.discardDraft.mockRejectedValue(new Error('delete unavailable'));
  await controller.discard(draft(1));
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'failed',
    drafts: [draft(1)],
    error: 'delete unavailable',
  });
  await controller.refresh();
  expect(controller.getSnapshot()).toMatchObject({ phase: 'ready', error: null });
});

it('does not admit duplicate deletes or refreshes during an accepted deletion', async () => {
  const { repository, controller } = setup();
  let finish!: (value: boolean) => void;
  repository.discardDraft.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const deleting = controller.discard(draft(1));
  await controller.discard(draft(1));
  await controller.refresh();
  expect(repository.discardDraft).toHaveBeenCalledTimes(1);
  expect(repository.listDrafts).not.toHaveBeenCalled();
  finish(true);
  await deleting;
  expect(controller.getSnapshot().phase).toBe('ready');
});
