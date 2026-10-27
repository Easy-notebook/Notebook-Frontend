import { afterEach, expect, it, vi } from 'vitest';
import { FileService } from './FileService';
import { fileUploadClient } from './FileUploadClient';
import { handleFileUpload } from '@Utils/fileUtils';
afterEach(() => vi.restoreAllMocks());

it('drives the actual upload workflow through the upload-only client with directory, progress and cancellation', async () => {
  const file = new File(['text'], 'note.txt', { type: 'text/plain' });
  const config = {
    mode: 'restricted' as const,
    maxFileSize: 1024,
    allowedTypes: ['.txt'],
    targetDir: 'assets',
  };
  const transport = vi
    .spyOn(FileService, 'uploadFile')
    .mockImplementation(async (_id, _files, _config, progress) => {
      progress?.({ loaded: 1, total: 2 });
      return { status: 'ok' };
    });
  const setUploadProgress = vi.fn();
  const onUpdate = vi.fn();
  const fetchFileList = vi.fn().mockResolvedValue(undefined);
  const controller = { current: null as AbortController | null };
  const toast = vi.fn();
  await handleFileUpload({
    notebookId: 'notebook',
    files: [file],
    fileService: fileUploadClient,
    uploadConfig: config,
    setUploading: vi.fn(),
    setUploadProgress,
    setError: vi.fn(),
    fileInputRef: { current: null },
    setIsPreview: vi.fn(),
    toast,
    onUpdate,
    cellId: 'cell',
    abortControllerRef: controller,
    fetchFileList,
  });
  expect(transport).toHaveBeenCalledWith(
    'notebook',
    [file],
    config,
    expect.any(Function),
    expect.any(AbortSignal)
  );
  expect(controller.current).toBeNull();
  expect(setUploadProgress).toHaveBeenCalledWith(50);
  expect(fetchFileList).toHaveBeenCalledOnce();
  expect(onUpdate).toHaveBeenCalledWith('cell', { uploadedFiles: ['note.txt'] });
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
});
