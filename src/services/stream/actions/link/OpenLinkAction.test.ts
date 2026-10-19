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
  expect(preview.previewFileInSplit).toHaveBeenCalledExactlyOnceWith(
    'requested',
    'folder/a.txt',
    undefined,
    undefined
  );
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
  expect(preview.previewFileInSplit).toHaveBeenCalledWith(
    'current',
    'report.csv',
    undefined,
    undefined
  );
});

it('uses the explicit payload notebook when no command context is provided', async () => {
  preview.previewMode = 'file';
  await new OpenLinkAction().execute({
    payload: { filePath: 'a.txt', notebook_id: 'source' },
    showToast: vi.fn(),
  });
  expect(preview.previewFileInSplit).toHaveBeenCalledWith('source', 'a.txt', undefined, undefined);
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

it('does not open links for an already cancelled action', async () => {
  const controller = new AbortController();
  controller.abort();
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  await expect(
    new OpenLinkAction().execute({
      payload: { url: 'https://example.com' },
      showToast: vi.fn(),
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(open).not.toHaveBeenCalled();
});

it('checks cancellation after lazy loading before admitting a preview', async () => {
  const controller = new AbortController();
  const pending = new OpenLinkAction().execute({
    payload: { filePath: 'file.txt' },
    showToast: vi.fn(),
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(preview.previewFileInSplit).not.toHaveBeenCalled();
});

it('forwards cancellation to preview loading and suppresses late UI publication', async () => {
  const controller = new AbortController();
  preview.previewFileInSplit.mockImplementation(async () => {
    controller.abort();
    return { id: 'file' };
  });
  const showToast = vi.fn();
  await expect(
    new OpenLinkAction().execute({
      payload: { filePath: 'file.txt' },
      showToast,
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(preview.previewFileInSplit).toHaveBeenCalledWith(
    'current',
    'file.txt',
    undefined,
    controller.signal
  );
  expect(preview.changePreviewMode).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

it('does not notify after a mode subscriber cancels the action', async () => {
  const controller = new AbortController();
  preview.changePreviewMode.mockImplementation(() => controller.abort());
  const showToast = vi.fn();
  await expect(
    new OpenLinkAction().execute({
      payload: { filePath: 'file.txt' },
      showToast,
      signal: controller.signal,
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(showToast).not.toHaveBeenCalled();
});
