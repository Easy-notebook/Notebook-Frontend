import { expect, it, vi } from 'vitest';
import { handleFileUpload } from './fileUtils';
import type { FileUploadClient } from '@Services/notebook/FileUploadClient';
import type { ApiResponse } from '@Services/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const requests: Array<{
    result: ReturnType<typeof deferred<ApiResponse>>;
    progress: (event: ProgressEvent) => void;
    signal: AbortSignal;
  }> = [];
  const uploadFiles: FileUploadClient['uploadFiles'] = vi.fn(
    (_id, _files, _config, progress, signal) => {
      const result = deferred<ApiResponse>();
      requests.push({ result, progress, signal });
      return result.promise;
    }
  );
  const input = document.createElement('input');
  input.value = 'selected';
  const params = {
    notebookId: 'owner',
    files: [new File(['a'], 'a.txt')],
    fileService: { uploadFiles },
    uploadConfig: { mode: 'open' as const, maxFileSize: 1024, allowedTypes: [] as string[] },
    setUploading: vi.fn(),
    setUploadProgress: vi.fn(),
    setError: vi.fn(),
    fileInputRef: { current: input },
    setIsPreview: vi.fn(),
    toast: vi.fn(),
    onUpdate: vi.fn(),
    cellId: 'cell',
    abortControllerRef: { current: null as AbortController | null },
    fetchFileList: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  return { params, requests, start: () => handleFileUpload(params) };
}

it.each(['resolve', 'reject'] as const)(
  'ignores an obsolete request that later %ss without clearing the active upload',
  async (settle) => {
    const f = fixture();
    const old = f.start();
    const current = f.start();
    expect(f.requests[0].signal.aborted).toBe(true);
    const controller = f.params.abortControllerRef.current;
    f.params.setUploadProgress.mockClear();
    f.params.setUploading.mockClear();
    f.requests[0].progress({ loaded: 9, total: 10 } as ProgressEvent);
    if (settle === 'resolve') f.requests[0].result.resolve({ status: 'ok' });
    else f.requests[0].result.reject(new Error('late failure'));
    await old;
    expect(f.params.setUploadProgress).not.toHaveBeenCalled();
    expect(f.params.setUploading).not.toHaveBeenCalled();
    expect(f.params.fetchFileList).not.toHaveBeenCalled();
    expect(f.params.toast).not.toHaveBeenCalled();
    expect(f.params.fileInputRef.current.value).toBe('selected');
    expect(f.params.abortControllerRef.current).toBe(controller);
    f.requests[1].result.resolve({ status: 'ok' });
    await current;
    expect(f.params.onUpdate).toHaveBeenCalledOnce();
    expect(f.params.setUploading).toHaveBeenLastCalledWith(false);
    expect(f.params.abortControllerRef.current).toBeNull();
  }
);

it('does not publish old success when replacement starts during list refresh', async () => {
  const f = fixture();
  const refresh = deferred<void>();
  f.params.fetchFileList.mockReturnValueOnce(refresh.promise);
  const old = f.start();
  f.requests[0].result.resolve({ status: 'ok' });
  await Promise.resolve();
  expect(f.params.fetchFileList).toHaveBeenCalledOnce();
  const current = f.start();
  refresh.resolve();
  await old;
  expect(f.params.onUpdate).not.toHaveBeenCalled();
  expect(f.params.toast).not.toHaveBeenCalled();
  expect(f.params.setUploading).not.toHaveBeenCalledWith(false);
  f.requests[1].result.resolve({ status: 'ok' });
  await current;
});

it.each(['resolve', 'reject'] as const)(
  'reports cancellation even when the transport %ss with a different outcome',
  async (settle) => {
    const f = fixture();
    const upload = f.start();
    f.params.abortControllerRef.current?.abort();
    f.params.setUploadProgress.mockClear();
    f.requests[0].progress({ loaded: 1, total: 2 } as ProgressEvent);
    expect(f.params.setUploadProgress).not.toHaveBeenCalled();
    if (settle === 'resolve') f.requests[0].result.resolve({ status: 'ok' });
    else
      f.requests[0].result.reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }));
    await upload;
    expect(f.params.setError).toHaveBeenLastCalledWith('Upload cancelled');
    expect(f.params.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }));
    expect(f.params.fetchFileList).not.toHaveBeenCalled();
    expect(f.params.onUpdate).not.toHaveBeenCalled();
  }
);

it('captures file names and ignores unknown or late progress', async () => {
  const f = fixture();
  const upload = f.start();
  f.params.files.push(new File(['b'], 'b.txt'));
  f.params.setUploadProgress.mockClear();
  f.requests[0].progress({ loaded: 1, total: 0 } as ProgressEvent);
  f.requests[0].progress({ loaded: NaN, total: 10 } as ProgressEvent);
  expect(f.params.setUploadProgress).not.toHaveBeenCalled();
  f.requests[0].progress({ loaded: 20, total: 10 } as ProgressEvent);
  expect(f.params.setUploadProgress).toHaveBeenLastCalledWith(100);
  f.requests[0].result.resolve({ status: 'ok' });
  await upload;
  expect(f.params.onUpdate).toHaveBeenCalledWith('cell', { uploadedFiles: ['a.txt'] });
  f.params.setUploadProgress.mockClear();
  f.requests[0].progress({ loaded: 1, total: 2 } as ProgressEvent);
  expect(f.params.setUploadProgress).not.toHaveBeenCalled();
});

it('preserves a replacement started synchronously from a completion callback', async () => {
  const f = fixture();
  let next: Promise<void> | undefined;
  f.params.setIsPreview.mockImplementationOnce(() => {
    next = f.start();
  });
  const old = f.start();
  f.requests[0].result.resolve({ status: 'ok' });
  await old;
  expect(f.params.toast).not.toHaveBeenCalled();
  expect(f.params.setUploading).not.toHaveBeenCalledWith(false);
  expect(f.params.abortControllerRef.current?.signal).toBe(f.requests[1].signal);
  f.requests[1].result.resolve({ status: 'ok' });
  await next;
  expect(f.params.onUpdate).toHaveBeenCalledOnce();
});

it('cancels publication while list refresh is pending', async () => {
  const f = fixture();
  const refresh = deferred<void>();
  f.params.fetchFileList.mockReturnValueOnce(refresh.promise);
  const upload = f.start();
  f.requests[0].result.resolve({ status: 'ok' });
  await Promise.resolve();
  f.params.abortControllerRef.current?.abort();
  refresh.resolve();
  await upload;
  expect(f.params.onUpdate).not.toHaveBeenCalled();
  expect(f.params.setIsPreview).not.toHaveBeenCalled();
  expect(f.params.setError).toHaveBeenLastCalledWith('Upload cancelled');
});

it('keeps uploads on separate controls independent', async () => {
  const first = fixture();
  const second = fixture();
  const uploads = [first.start(), second.start()];
  first.params.abortControllerRef.current?.abort();
  expect(second.requests[0].signal.aborted).toBe(false);
  first.requests[0].result.resolve({ status: 'ok' });
  second.requests[0].result.resolve({ status: 'ok' });
  await Promise.all(uploads);
  expect(first.params.onUpdate).not.toHaveBeenCalled();
  expect(second.params.onUpdate).toHaveBeenCalledOnce();
});
