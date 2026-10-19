import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({
  state: {
    activeFile: {
      id: 'book::first.js',
      name: 'first.js',
      path: 'first.js',
      notebookId: 'book',
      type: 'javascript',
      content: 'original',
    },
    activeSplitFile: {
      id: 'book::split.js',
      name: 'split.js',
      path: 'split.js',
      notebookId: 'book',
      type: 'javascript',
      content: 'split',
    },
    previewMode: 'file',
    currentPreviewFiles: [],
    setTabDirty: vi.fn(),
    updatePreviewFileContent: vi.fn(),
  },
  notebook: { detachedCellId: null as string | null },
  callbacks: [] as Array<(content: string) => Promise<void>>,
}));
vi.mock('@Store/previewStore', () => ({
  default: Object.assign(
    (select?: (state: typeof model.state) => unknown) =>
      select ? select(model.state) : model.state,
    { getState: () => model.state }
  ),
}));
vi.mock('@Store/notebookStore', () => ({
  default: (select?: (state: typeof model.notebook) => unknown) => {
    const state = model.notebook;
    return select ? select(state) : state;
  },
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('./DeferredViewers', () => ({
  PreviewLoadBoundary: ({ children }: { children: ReactNode }) => children,
  CodeDisplay: ({ onContentChange }: { onContentChange: (content: string) => Promise<void> }) => {
    model.callbacks.push(onContentChange);
    return null;
  },
}));
vi.mock('./image/ImageDisplay', () => ({ default: () => null }));
vi.mock('./pdf/PDFDisplay', () => ({ default: () => null }));
vi.mock('./hex/HexDisplay', () => ({ default: () => null }));
vi.mock('./web/IframeViewer', () => ({ default: () => null }));
vi.mock('react-virtualized-auto-sizer', () => ({ default: () => null }));
import PreviewApp from './PreviewApp';
import TabbedPreviewApp from './TabbedPreviewApp';
import DataTable from './data-table/DataTable';

beforeEach(() => {
  vi.clearAllMocks();
  model.notebook.detachedCellId = null;
  model.callbacks.length = 0;
  model.state.activeFile = {
    id: 'book::first.js',
    name: 'first.js',
    path: 'first.js',
    notebookId: 'book',
    type: 'javascript',
    content: 'original',
  };
});
afterEach(cleanup);

describe.each([PreviewApp, TabbedPreviewApp])('preview editor identity', (View) => {
  it('keeps the rendered file identity in a callback invoked after navigation', async () => {
    const view = render(<View />);
    const previousCallback = model.callbacks[0];
    model.state.activeFile = {
      ...model.state.activeFile,
      id: 'book::second.js',
      name: 'second.js',
      path: 'second.js',
    };
    view.rerender(<View />);
    await act(async () => previousCallback('late edit'));
    expect(model.state.updatePreviewFileContent).toHaveBeenCalledWith('late edit', {
      surface: 'normal',
      fileId: 'book::first.js',
    });
  });
});

it('does not acknowledge a save just because the keyboard shortcut was pressed', () => {
  render(<TabbedPreviewApp />);
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  expect(model.state.setTabDirty).not.toHaveBeenCalled();
});

it.each([false, true])(
  'spreadsheet clears dirty state only on a confirmed save: %s',
  async (success) => {
    model.state.activeFile = {
      ...model.state.activeFile,
      id: 'book::table.csv',
      name: 'table.csv',
      path: 'table.csv',
      type: 'csv',
      content: 'name\nAda',
    };
    model.state.updatePreviewFileContent.mockResolvedValueOnce(
      success ? model.state.activeFile : null
    );
    render(<DataTable />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(model.state.updatePreviewFileContent).toHaveBeenCalledWith(expect.any(String), {
        surface: 'normal',
        fileId: 'book::table.csv',
      })
    );
    if (success) expect(model.state.setTabDirty).toHaveBeenCalledWith('book::table.csv', false);
    else expect(model.state.setTabDirty).not.toHaveBeenCalledWith('book::table.csv', false);
  }
);

it('split editor callbacks carry split identity even while a normal file is selected', async () => {
  model.notebook.detachedCellId = 'cell';
  render(<PreviewApp />);
  await act(async () => model.callbacks[0]('split edit'));
  expect(model.state.updatePreviewFileContent).toHaveBeenCalledWith('split edit', {
    surface: 'split',
    fileId: 'book::split.js',
  });
});

it('saving CSV preserves source cells and adds no spreadsheet column-label row', async () => {
  const content = '"name,label",notes\n"Ada, Lovelace","line one\nline ""two"""';
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::table.csv',
    name: 'table.csv',
    path: 'table.csv',
    type: 'csv',
    content,
  };
  render(<DataTable />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(model.state.updatePreviewFileContent).toHaveBeenCalledWith(content, {
      surface: 'normal',
      fileId: 'book::table.csv',
    })
  );
});

it('exports the same CSV bytes as the save action', async () => {
  const content = '"name,label",notes\n"Ada, Lovelace","line one\nline ""two"""';
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::table.csv',
    name: 'table.csv',
    path: 'table.csv',
    type: 'csv',
    content,
  };
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:export');
  const revokeObjectURL = vi.fn();
  const OriginalURL = URL;
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
  );
  try {
    render(<DataTable />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0];
    const exported = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(exported).toBe(content);
    expect(exported).toBe(model.state.updatePreviewFileContent.mock.calls[0][0]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
  }
});
