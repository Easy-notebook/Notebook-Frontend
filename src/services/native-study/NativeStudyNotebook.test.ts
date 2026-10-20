import { beforeEach, expect, it, vi } from 'vitest';
import type { IPersistenceService } from '@Services/persistence/interfaces';
import { NativeStudyNotebook } from './NativeStudyNotebook';
const native = vi.hoisted(() => ({ state: vi.fn(async () => ({})) }));
vi.mock('./NativeStudyClient', () => ({
  NativeStudyClient: class {
    state = native.state;
  },
}));
beforeEach(() => native.state.mockReset().mockResolvedValue({}));
function persistence() {
  const save = vi.fn(async () => ({}));
  return {
    save,
    service: {
      initialize: vi.fn(async () => {}),
      notebooks: { saveNotebookSnapshot: save },
    } as unknown as IPersistenceService,
  };
}
it('creates one persisted editor document for concurrent create clicks', async () => {
  const { save, service } = persistence();
  const creator = new NativeStudyNotebook(service);
  const [first, second] = await Promise.all([creator.create(), creator.create()]);
  expect(first).toBe(second);
  expect(save).toHaveBeenCalledTimes(1);
  expect(native.state).toHaveBeenCalledTimes(1);
  const [file, notebook] = save.mock.calls[0] as unknown as [
    { content: string; notebookId: string },
    { id: string },
  ];
  expect(file.notebookId).toBe(first);
  expect(notebook.id).toBe(first);
  const document = JSON.parse(file.content);
  expect(document.cells[0].content).toBe('# 房屋特征研究');
  expect(document.cells).toHaveLength(2);
});
it('does not persist a misleading ready notebook when native connection fails', async () => {
  native.state.mockRejectedValueOnce(new Error('offline'));
  const { save, service } = persistence();
  const creator = new NativeStudyNotebook(service);
  await expect(creator.create()).rejects.toThrow('offline');
  expect(save).not.toHaveBeenCalled();
  await creator.create();
  expect(save).toHaveBeenCalledTimes(1);
});
