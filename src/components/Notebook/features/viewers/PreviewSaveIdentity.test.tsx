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
    activeSplitFile: null,
    previewMode: 'file',
    currentPreviewFiles: [],
    setTabDirty: vi.fn(),
    updateActiveFileContent: vi.fn(),
  },
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
  default: (select?: (state: { detachedCellId: null }) => unknown) => {
    const state = { detachedCellId: null };
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
    expect(model.state.updateActiveFileContent).toHaveBeenCalledWith('late edit', 'book::first.js');
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
    model.state.updateActiveFileContent.mockResolvedValueOnce(
      success ? model.state.activeFile : null
    );
    render(<DataTable />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(model.state.updateActiveFileContent).toHaveBeenCalledWith(
        expect.any(String),
        'book::table.csv'
      )
    );
    if (success) expect(model.state.setTabDirty).toHaveBeenCalledWith('book::table.csv', false);
    else expect(model.state.setTabDirty).not.toHaveBeenCalledWith('book::table.csv', false);
  }
);
