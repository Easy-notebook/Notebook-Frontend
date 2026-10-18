import { expect, it, vi } from 'vitest';
import { NotebookRecoveryController } from './NotebookRecoveryController';
import type { NotebookRecoveryRecord } from '../persistence/interfaces';

function setup() {
  const repository = {
    saveDraft: vi.fn(),
    restoreDraft: vi.fn().mockResolvedValue(null),
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

it('restores the reviewed revision and preserves the open link if list refresh fails', async () => {
  const { repository, controller } = setup();
  repository.restoreDraft.mockResolvedValue({ id: 'copy', name: 'Recovered' });
  repository.listDrafts.mockRejectedValue(new Error('list unavailable'));
  await controller.restore(draft(4));
  expect(repository.restoreDraft).toHaveBeenCalledExactlyOnceWith('draft', 4);
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'failed',
    restored: { id: 'copy', name: 'Recovered' },
    error: 'list unavailable',
  });
});

it('refreshes stale restoration without presenting a nonexistent new notebook', async () => {
  const { repository, controller } = setup();
  repository.listDrafts.mockResolvedValue([draft(5)]);
  await controller.restore(draft(4));
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    restored: null,
    drafts: [draft(5)],
    notice: expect.stringContaining('changed'),
  });
});

it('serializes restore against deletion and duplicate restore actions', async () => {
  const { repository, controller } = setup();
  let finish!: (value: { id: string; name: string }) => void;
  repository.restoreDraft.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const restoring = controller.restore(draft(1));
  await controller.discard(draft(1));
  await controller.restore(draft(1));
  await controller.refresh();
  expect(repository.restoreDraft).toHaveBeenCalledTimes(1);
  expect(repository.discardDraft).not.toHaveBeenCalled();
  finish({ id: 'copy', name: 'Copy' });
  await restoring;
  expect(controller.getSnapshot().phase).toBe('ready');
});

it('keeps the last created notebook accessible after a stale restore retry', async () => {
  const { repository, controller } = setup();
  repository.restoreDraft.mockResolvedValueOnce({ id: 'copy', name: 'Recovered' });
  repository.listDrafts.mockRejectedValueOnce(new Error('refresh unavailable'));
  await controller.restore(draft(1));
  await controller.restore(draft(1));
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    restored: { id: 'copy', name: 'Recovered' },
    notice: expect.stringContaining('changed'),
  });
});
