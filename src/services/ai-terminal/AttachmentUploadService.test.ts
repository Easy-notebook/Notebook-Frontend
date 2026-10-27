import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  owner: null as string | null,
  setNotebook: vi.fn(),
  initialize: vi.fn(),
  kernel: vi.fn(),
  ready: vi.fn(),
  upload: vi.fn(),
  createUrl: vi.fn(),
  revokeUrl: vi.fn(),
}));
vi.mock('@Store/notebookStore', () => ({
  default: { getState: () => ({ notebookId: io.owner, setNotebookId: io.setNotebook }) },
}));
vi.mock('@Store/codeStore', () => ({
  default: { getState: () => ({ initializeKernel: io.kernel, setKernelReady: io.ready }) },
}));
vi.mock('@Services/notebook/NotebookLifecycleService', () => ({
  NotebookLifecycleService: { initializeNotebook: io.initialize },
}));
vi.mock('@Services/notebook/FileService', () => ({ FileService: { uploadFile: io.upload } }));
import { AttachmentUploadService } from './AttachmentUploadService';
const file = (name = 'a.txt') => new File(['a'], name);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  io.owner = null;
  io.setNotebook.mockImplementation(async (id: string) => {
    io.owner = id;
  });
  io.initialize.mockResolvedValue({ status: 'ok', notebook_id: 'created' });
  io.kernel.mockImplementation(async () => io.owner);
  io.upload.mockResolvedValue({ status: 'ok' });
  io.createUrl.mockImplementation((f: File) => `blob:${f.name}`);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = io.createUrl;
      static revokeObjectURL = io.revokeUrl;
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

it('validates the whole batch before initialization or upload', async () => {
  await expect(
    new AttachmentUploadService().uploadFiles([file(), file('bad.exe')])
  ).rejects.toThrow('File type not allowed');
  expect(io.initialize).not.toHaveBeenCalled();
  expect(io.kernel).not.toHaveBeenCalled();
  expect(io.upload).not.toHaveBeenCalled();
});
it('initializes once and sends multiple attachments in one request to the same notebook', async () => {
  const files = [file(), file('b.txt')];
  const result = await new AttachmentUploadService().uploadFiles(files);
  expect(io.initialize).toHaveBeenCalledOnce();
  expect(io.kernel).toHaveBeenCalledOnce();
  expect(io.setNotebook).toHaveBeenCalledExactlyOnceWith('created', { preserveContent: true });
  expect(io.upload).toHaveBeenCalledExactlyOnceWith(
    'created',
    files,
    expect.objectContaining({ maxFiles: 2, targetDir: 'assets' })
  );
  expect(result.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
  expect(result[0].id).not.toBe(result[1].id);
});
it('shares an in-flight notebook initialization between concurrent attachment batches', async () => {
  const init = deferred<{ status: string; notebook_id: string }>();
  io.initialize.mockReturnValue(init.promise);
  const service = new AttachmentUploadService();
  const first = service.uploadFiles([file()]);
  const second = service.uploadFiles([file('b.txt')]);
  expect(io.initialize).toHaveBeenCalledOnce();
  init.resolve({ status: 'ok', notebook_id: 'created' });
  await Promise.all([first, second]);
  expect(io.setNotebook).toHaveBeenCalledOnce();
  expect(io.upload.mock.calls.map((args) => args[0])).toEqual(['created', 'created']);
});
it('does not overwrite a notebook selected while initialization is pending', async () => {
  const init = deferred<{ status: string; notebook_id: string }>();
  io.initialize.mockReturnValue(init.promise);
  const pending = new AttachmentUploadService().uploadFiles([file()]);
  io.owner = 'selected';
  init.resolve({ status: 'ok', notebook_id: 'created' });
  await expect(pending).rejects.toThrow('Notebook changed');
  expect(io.setNotebook).not.toHaveBeenCalled();
  expect(io.upload).not.toHaveBeenCalled();
});
it('rejects stale completion without allocating attachment URLs', async () => {
  io.owner = 'original';
  const upload = deferred<{ status: string }>();
  io.upload.mockReturnValue(upload.promise);
  const pending = new AttachmentUploadService().uploadFiles([file()]);
  await vi.waitFor(() => expect(io.upload).toHaveBeenCalledOnce());
  io.owner = 'other';
  upload.resolve({ status: 'ok' });
  await expect(pending).rejects.toThrow('Notebook changed');
  expect(io.createUrl).not.toHaveBeenCalled();
});
it('reports backend rejection instead of silently returning missing attachments', async () => {
  io.owner = 'original';
  io.upload.mockResolvedValue({ status: 'error', message: 'denied' });
  await expect(new AttachmentUploadService().uploadFiles([file()])).rejects.toThrow('denied');
  expect(io.initialize).not.toHaveBeenCalled();
  expect(io.createUrl).not.toHaveBeenCalled();
});
it('releases already-created preview URLs when attachment construction fails', async () => {
  io.owner = 'original';
  io.createUrl.mockReturnValueOnce('blob:first').mockImplementationOnce(() => {
    throw new Error('allocation failed');
  });
  await expect(new AttachmentUploadService().uploadFiles([file(), file('b.txt')])).rejects.toThrow(
    'allocation failed'
  );
  expect(io.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:first');
});
it('admits no work for an empty selection and releases failed initialization for retry', async () => {
  const service = new AttachmentUploadService();
  expect(await service.uploadFiles([])).toEqual([]);
  expect(io.initialize).not.toHaveBeenCalled();
  io.initialize.mockRejectedValueOnce(new Error('offline'));
  await expect(service.uploadFiles([file()])).rejects.toThrow('offline');
  await expect(service.uploadFiles([file()])).resolves.toHaveLength(1);
  expect(io.initialize).toHaveBeenCalledTimes(2);
});

it('does not upload when kernel initialization fails', async () => {
  io.owner = 'original';
  io.kernel.mockResolvedValue(false);
  await expect(new AttachmentUploadService().uploadFiles([file()])).rejects.toThrow('kernel');
  expect(io.upload).not.toHaveBeenCalled();
});

it('does not adopt a notebook ID from a rejected initialization response', async () => {
  io.initialize.mockResolvedValue({ status: 'error', notebook_id: 'invalid', message: 'denied' });
  await expect(new AttachmentUploadService().uploadFiles([file()])).rejects.toThrow('denied');
  expect(io.setNotebook).not.toHaveBeenCalled();
  expect(io.upload).not.toHaveBeenCalled();
});

it('captures the selected batch before initialization awaits', async () => {
  const init = deferred<{ status: string; notebook_id: string }>();
  io.initialize.mockReturnValue(init.promise);
  const selected = [file()];
  const pending = new AttachmentUploadService().uploadFiles(selected);
  selected.push(file('bad.exe'));
  init.resolve({ status: 'ok', notebook_id: 'created' });
  expect(await pending).toHaveLength(1);
  expect(io.upload.mock.calls[0][1]).toHaveLength(1);
});
