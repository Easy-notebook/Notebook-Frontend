import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useNotebookUploadControl } from './useNotebookUploadControl';
import { handleFileUpload } from '@Utils/fileUtils';
import type { ApiResponse } from '@Services/types';

function pendingUpload(control: ReturnType<typeof useNotebookUploadControl>) {
  let resolve!: (response: ApiResponse) => void;
  const uploadFiles = vi.fn(
    () =>
      new Promise<ApiResponse>((done) => {
        resolve = done;
      })
  );
  const params = {
    notebookId: 'first',
    files: [new File(['text'], 'note.txt')],
    fileService: { uploadFiles },
    uploadConfig: { mode: 'open' as const, maxFileSize: 1024, allowedTypes: [] },
    setUploading: vi.fn(),
    setUploadProgress: vi.fn(),
    setError: vi.fn(),
    fileInputRef: { current: null },
    setIsPreview: vi.fn(),
    toast: vi.fn(),
    onUpdate: vi.fn(),
    cellId: 'cell',
    abortControllerRef: control,
    fetchFileList: vi.fn().mockResolvedValue(undefined),
  };
  const promise = handleFileUpload(params);
  const signal = control.current?.signal;
  return { params, promise, signal, resolve: () => resolve({ status: 'ok' }) };
}

it.each(['switch', 'unmount'] as const)(
  'revokes publication and rejects stale callback starts after %s',
  async (event) => {
    const hook = renderHook(({ id }) => useNotebookUploadControl(id), {
      initialProps: { id: 'first' },
    });
    const original = hook.result.current;
    const upload = pendingUpload(original);
    upload.params.setUploading.mockClear();
    if (event === 'switch') hook.rerender({ id: 'second' });
    else hook.unmount();
    expect(upload.signal?.aborted).toBe(true);
    expect(original.current).toBeNull();
    await act(async () => {
      upload.resolve();
      await upload.promise;
    });
    expect(upload.params.setUploading).not.toHaveBeenCalled();
    expect(upload.params.fetchFileList).not.toHaveBeenCalled();
    expect(upload.params.toast).not.toHaveBeenCalled();
    expect(upload.params.onUpdate).not.toHaveBeenCalled();
    await handleFileUpload(upload.params);
    expect(upload.params.fileService.uploadFiles).toHaveBeenCalledOnce();
    expect(upload.params.setUploading).not.toHaveBeenCalled();
    if (event === 'switch') {
      const next = pendingUpload(hook.result.current);
      await act(async () => {
        next.resolve();
        await next.promise;
      });
      expect(next.params.onUpdate).toHaveBeenCalledOnce();
      hook.unmount();
    }
  }
);

it('supports StrictMode setup replay and preserves the owner on ordinary rerenders', async () => {
  const hook = renderHook(() => useNotebookUploadControl('first'), { wrapper: StrictMode });
  const original = hook.result.current;
  const upload = pendingUpload(original);
  hook.rerender();
  expect(hook.result.current).toBe(original);
  expect(upload.signal?.aborted).toBe(false);
  await act(async () => {
    upload.resolve();
    await upload.promise;
  });
  expect(upload.params.onUpdate).toHaveBeenCalledOnce();
  hook.unmount();
});

it('does not admit uploads without a notebook owner', async () => {
  const hook = renderHook(() => useNotebookUploadControl(null));
  const upload = pendingUpload(hook.result.current);
  await upload.promise;
  expect(upload.params.fileService.uploadFiles).not.toHaveBeenCalled();
  expect(upload.params.setUploading).not.toHaveBeenCalled();
  hook.unmount();
});
