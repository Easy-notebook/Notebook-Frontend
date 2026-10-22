import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BinaryModelExport } from './BinaryModelExport';
import type { NativeView } from '@Services/native-study/contracts';
import { downloadBlob } from '@Services/notebook/BrowserDownload';
vi.mock('@Services/notebook/BrowserDownload', () => ({ downloadBlob: vi.fn() }));
const view = {
  document: { id: 'workspace', revision: 1 },
  study: {
    current: true,
    result: {
      report: {
        model: {
          version: 1,
          training_rows: 12,
          features: [{ name: 'area', mean: 100, scale: 10 }],
          centers: [[-1], [1]],
        },
      },
    },
  },
} as unknown as NativeView;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('downloads the returned binary bytes with the portable model extension', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ frontend_notebook_id: 'houses', bytes: Array(48).fill(0) }),
    })
  );
  render(<BinaryModelExport notebookId="houses" view={view} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: '导出二进制模型' }));
  fireEvent.click(await screen.findByRole('button', { name: '保存 .aalkm 文件' }));
  expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'mining-model.aalkm');
});
it('aborts a superseded export and never offers its late bytes for download', async () => {
  let finish!: (value: unknown) => void;
  const fetch = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  vi.stubGlobal('fetch', fetch);
  const ui = render(<BinaryModelExport notebookId="houses" view={view} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: '导出二进制模型' }));
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
  ui.rerender(
    <BinaryModelExport
      notebookId="houses"
      view={{ ...view, document: { ...view.document, revision: 2 } }}
      disabled={false}
    />
  );
  expect(signal.aborted).toBe(true);
  await act(async () =>
    finish({
      ok: true,
      json: async () => ({ frontend_notebook_id: 'houses', bytes: Array(48).fill(0) }),
    })
  );
  expect(screen.queryByRole('button', { name: '保存 .aalkm 文件' })).not.toBeInTheDocument();
  expect(downloadBlob).not.toHaveBeenCalled();
});
