import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  owner: null as string | null,
  setNotebook: vi.fn(),
  create: vi.fn(),
  upload: vi.fn(),
  ready: vi.fn(),
  createUrl: vi.fn(),
  revokeUrl: vi.fn(),
}));
vi.mock('@Store/notebookStore', () => ({
  default: { getState: () => ({ notebookId: io.owner, setNotebookId: io.setNotebook }) },
}));
vi.mock('@Store/codeStore', () => ({
  default: { getState: () => ({ setKernelReady: io.ready }) },
}));
vi.mock('@Services/notebook/FileService', () => ({
  FileService: { createNotebookWithFiles: io.create, uploadFile: io.upload },
}));
import { EmptyStateAttachmentUploadService } from './EmptyStateAttachmentUploadService';
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
  io.create.mockResolvedValue({ status: 'ok', notebook_id: 'created' });
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
it('creates with the first batch and uploads concurrent batches once to that notebook', async () => {
  const creation = deferred<{ status: string; notebook_id: string }>();
  io.create.mockReturnValue(creation.promise);
  const service = new EmptyStateAttachmentUploadService();
  const a = [file()];
  const b = [file('b.pptx')];
  const first = service.uploadFiles(a);
  const second = service.uploadFiles(b);
  creation.resolve({ status: 'ok', notebook_id: 'created' });
  expect((await Promise.all([first, second])).map((batch) => batch[0].name)).toEqual([
    'a.txt',
    'b.pptx',
  ]);
  expect(io.create).toHaveBeenCalledExactlyOnceWith(a, 'assets');
  expect(io.upload).toHaveBeenCalledExactlyOnceWith(
    'created',
    b,
    expect.objectContaining({ targetDir: 'assets' })
  );
  expect(io.setNotebook).toHaveBeenCalledExactlyOnceWith('created');
});
it('does not overwrite a notebook selected while creation is pending', async () => {
  const creation = deferred<unknown>();
  io.create.mockReturnValue(creation.promise);
  const pending = new EmptyStateAttachmentUploadService().uploadFiles([file()]);
  io.owner = 'selected';
  creation.resolve({ status: 'ok', notebook_id: 'created' });
  await expect(pending).rejects.toThrow('Notebook changed');
  expect(io.setNotebook).not.toHaveBeenCalled();
  expect(io.createUrl).not.toHaveBeenCalled();
});
it('rejects stale existing-notebook upload results before allocating URLs', async () => {
  io.owner = 'original';
  const upload = deferred<unknown>();
  io.upload.mockReturnValue(upload.promise);
  const pending = new EmptyStateAttachmentUploadService().uploadFiles([file()]);
  io.owner = 'selected';
  upload.resolve({ status: 'ok' });
  await expect(pending).rejects.toThrow('Notebook changed');
  expect(io.createUrl).not.toHaveBeenCalled();
  expect(io.setNotebook).not.toHaveBeenCalled();
});
it('waits for notebook activation before publishing previews or kernel readiness', async () => {
  const activation = deferred<void>();
  io.setNotebook.mockReturnValue(activation.promise);
  const pending = new EmptyStateAttachmentUploadService().uploadFiles([file()]);
  await vi.waitFor(() => expect(io.setNotebook).toHaveBeenCalledOnce());
  expect(io.createUrl).not.toHaveBeenCalled();
  expect(io.ready).not.toHaveBeenCalled();
  io.owner = 'created';
  activation.resolve();
  await pending;
  expect(io.ready).toHaveBeenCalledExactlyOnceWith(true);
});
it('preserves both supported notebook creation response shapes', async () => {
  io.create.mockResolvedValue({ status: 'ok', data: { notebook_id: 'nested' } });
  await new EmptyStateAttachmentUploadService().uploadFiles([file()]);
  expect(io.setNotebook).toHaveBeenCalledExactlyOnceWith('nested');
});
it('rejects invalid creation and allows a subsequent retry', async () => {
  const service = new EmptyStateAttachmentUploadService();
  io.create.mockResolvedValueOnce({ status: 'ok' });
  await expect(service.uploadFiles([file()])).rejects.toThrow('no notebook ID');
  expect(io.createUrl).not.toHaveBeenCalled();
  await expect(service.uploadFiles([file()])).resolves.toHaveLength(1);
});
it('validates all sizes before IO and treats empty batches as no work', async () => {
  const service = new EmptyStateAttachmentUploadService();
  expect(await service.uploadFiles([])).toEqual([]);
  const large = file();
  Object.defineProperty(large, 'size', { value: service.MAX_FILE_SIZE + 1 });
  await expect(service.uploadFiles([file(), large])).rejects.toThrow('too large');
  expect(io.create).not.toHaveBeenCalled();
  expect(io.upload).not.toHaveBeenCalled();
});
it('rolls back partial URL allocation after a successful upload', async () => {
  io.owner = 'existing';
  io.createUrl.mockReturnValueOnce('blob:first').mockImplementationOnce(() => {
    throw new Error('allocation');
  });
  await expect(
    new EmptyStateAttachmentUploadService().uploadFiles([file(), file('b.txt')])
  ).rejects.toThrow('allocation');
  expect(io.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:first');
});
it('rejects backend upload errors without publishing attachments', async () => {
  io.owner = 'existing';
  io.upload.mockResolvedValue({ status: 'error', message: 'denied' });
  await expect(new EmptyStateAttachmentUploadService().uploadFiles([file()])).rejects.toThrow(
    'denied'
  );
  expect(io.createUrl).not.toHaveBeenCalled();
});
