import { afterEach, expect, it, vi } from 'vitest';
import { FileService } from './FileService';
import { fileActionClient } from './FileActionClient';
import { handleDeleteFile, handleDownload } from '@Utils/fileUtils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['denied', undefined])(
  'does not report deletion success or refresh when the server rejects: %s',
  async (message) => {
    vi.spyOn(FileService, 'deleteFile').mockResolvedValue({ status: 'error', message });
    const toast = vi.fn();
    const refresh = vi.fn();
    await handleDeleteFile({
      notebookId: 'owner',
      filename: 'assets/a.txt',
      fileService: fileActionClient,
      fetchFileList: refresh,
      toast,
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        variant: 'destructive',
        description: expect.stringContaining(message || 'Failed to delete file'),
      })
    );
  }
);

it('refreshes only after acknowledged deletion and retains the notebook/path', async () => {
  const remove = vi.spyOn(FileService, 'deleteFile').mockResolvedValue({ status: 'ok' });
  const refresh = vi.fn().mockResolvedValue(undefined);
  const toast = vi.fn();
  await handleDeleteFile({
    notebookId: 'owner',
    filename: 'assets/a.txt',
    fileService: fileActionClient,
    fetchFileList: refresh,
    toast,
  });
  expect(remove).toHaveBeenCalledExactlyOnceWith('owner', 'assets/a.txt', undefined);
  expect(refresh).toHaveBeenCalledOnce();
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
});

it.each([false, true])(
  'releases download URL and anchor after click (failure=%s)',
  async (fail) => {
    const blob = new Blob(['a']);
    const download = vi.spyOn(FileService, 'downloadFile').mockResolvedValue(blob);
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      }
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      expect(this.download).toBe('a.txt');
      expect(this.isConnected).toBe(true);
      if (fail) throw new Error('click failed');
    });
    const toast = vi.fn();
    await handleDownload({
      notebookId: 'owner',
      filename: 'assets/a.txt',
      fileService: fileActionClient,
      toast,
    });
    expect(download).toHaveBeenCalledExactlyOnceWith('owner', 'assets/a.txt');
    expect(create).toHaveBeenCalledExactlyOnceWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test');
    expect(document.querySelector('a[href="blob:test"]')).toBeNull();
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ variant: fail ? 'destructive' : 'success' })
    );
  }
);
