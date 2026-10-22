import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DatasetDownload } from './DatasetDownload';
const io = vi.hoisted(() => ({ download: vi.fn(), save: vi.fn() }));
vi.mock('@Services/native-study/NativeDatasetClient', () => ({
  NativeDatasetClient: class {
    download = io.download;
  },
}));
vi.mock('@Services/notebook/BrowserDownload', () => ({ downloadBlob: io.save }));
afterEach(() => vi.clearAllMocks());
const dataset = { name: '房屋.csv', version: 'a'.repeat(64), sha256: 'b'.repeat(64), size: 3 };
it('hands only a verified completed response to the browser and allows retry after failure', async () => {
  io.download.mockRejectedValueOnce(new Error('corrupt')).mockResolvedValueOnce(new Blob(['a\n1']));
  const busy = vi.fn();
  render(<DatasetDownload notebookId="a" dataset={dataset} disabled={false} onBusyChange={busy} />);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('alert');
  expect(io.save).not.toHaveBeenCalled();
  expect(busy).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('原文件已交给浏览器下载。');
  expect(io.save).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), dataset.name);
});
it.each(['owner', 'version', 'unmount'])(
  'aborts and suppresses late download after %s replacement',
  async (change) => {
    let finish!: (blob: Blob) => void;
    io.download.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        })
    );
    const busy = vi.fn();
    const props = { dataset, disabled: false, onBusyChange: busy };
    const view = render(<DatasetDownload notebookId="a" {...props} />);
    fireEvent.click(screen.getByRole('button'));
    const signal = io.download.mock.calls[0][1] as AbortSignal;
    expect(screen.getByRole('button')).toBeDisabled();
    if (change === 'unmount') view.unmount();
    else
      view.rerender(
        <DatasetDownload
          {...props}
          notebookId={change === 'owner' ? 'b' : 'a'}
          dataset={change === 'version' ? { ...dataset, version: 'c'.repeat(64) } : dataset}
        />
      );
    expect(signal.aborted).toBe(true);
    finish(new Blob(['a\n1']));
    await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(io.save).not.toHaveBeenCalled();
  }
);
