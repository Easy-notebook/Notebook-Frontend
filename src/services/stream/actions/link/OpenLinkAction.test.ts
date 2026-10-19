import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OpenLinkAction } from './OpenLinkAction';

const state = vi.hoisted(() => ({ notebookId: 'current' as string | null }));
const preview = vi.hoisted(() => ({
  previewFileInSplit: vi.fn(),
  changePreviewMode: vi.fn(),
  previewMode: 'notebook',
  error: null as string | null,
}));
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => state } }));
vi.mock('@Store/previewStore', () => ({ default: { getState: () => preview } }));
beforeEach(() => {
  vi.resetAllMocks();
  state.notebookId = 'current';
  preview.previewMode = 'notebook';
  preview.error = null;
  preview.previewFileInSplit.mockResolvedValue({ id: 'file' });
});
afterEach(() => vi.restoreAllMocks());

it('awaits successful file loading before changing mode or notifying', async () => {
  let finish!: (file: { id: string }) => void;
  preview.previewFileInSplit.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const showToast = vi.fn();
  const opening = new OpenLinkAction().execute({
    notebookId: 'requested',
    payload: { filePath: 'folder/a.txt', title: 'Report' },
    showToast,
  });
  await vi.dynamicImportSettled();
  expect(preview.previewFileInSplit).toHaveBeenCalledExactlyOnceWith('requested', 'folder/a.txt');
  expect(showToast).not.toHaveBeenCalled();
  expect(preview.changePreviewMode).not.toHaveBeenCalled();
  finish({ id: 'file' });
  await opening;
  expect(preview.changePreviewMode).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledExactlyOnceWith({
    message: '已在分屏中打开: Report',
    type: 'success',
  });
});

it('captures the notebook identity before asynchronous module loading', async () => {
  const opening = new OpenLinkAction().execute({
    payload: { url: 'report.csv' },
    showToast: vi.fn(),
  });
  state.notebookId = 'next';
  await opening;
  expect(preview.previewFileInSplit).toHaveBeenCalledWith('current', 'report.csv');
});

it('uses the explicit payload notebook when no command context is provided', async () => {
  preview.previewMode = 'file';
  await new OpenLinkAction().execute({
    payload: { filePath: 'a.txt', notebook_id: 'source' },
    showToast: vi.fn(),
  });
  expect(preview.previewFileInSplit).toHaveBeenCalledWith('source', 'a.txt');
  expect(preview.changePreviewMode).not.toHaveBeenCalled();
});

it.each(['missing', 'rejected'])(
  'reports %s file load as failure without a success notification',
  async (failure) => {
    if (failure === 'missing') {
      preview.previewFileInSplit.mockResolvedValue(undefined);
      preview.error = 'file unavailable';
    } else preview.previewFileInSplit.mockRejectedValue(new Error('file unavailable'));
    const showToast = vi.fn();
    await expect(
      new OpenLinkAction().execute({ payload: { filePath: 'a.txt' }, showToast })
    ).rejects.toThrow('file unavailable');
    expect(showToast).not.toHaveBeenCalled();
    expect(preview.changePreviewMode).not.toHaveBeenCalled();
  }
);

it('opens an HTTP link using the editor convention without sending it to file APIs', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  await new OpenLinkAction().execute({
    payload: { url: 'https://example.com/report' },
    showToast: vi.fn(),
  });
  expect(open).toHaveBeenCalledExactlyOnceWith(
    'https://example.com/report',
    '_blank',
    'noopener,noreferrer'
  );
  expect(preview.previewFileInSplit).not.toHaveBeenCalled();
});

it.each(['javascript:alert(1)', 'data:text/html,hello', '//example.com/report', ''])(
  'rejects unsupported or empty target %j',
  async (url) => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(
      new OpenLinkAction().execute({ payload: { url }, showToast: vi.fn() })
    ).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
    expect(preview.previewFileInSplit).not.toHaveBeenCalled();
  }
);

it('requires notebook ownership for file previews', async () => {
  state.notebookId = null;
  await expect(
    new OpenLinkAction().execute({ payload: { filePath: 'a.txt' }, showToast: vi.fn() })
  ).rejects.toThrow('A notebook is required');
  expect(preview.previewFileInSplit).not.toHaveBeenCalled();
});
