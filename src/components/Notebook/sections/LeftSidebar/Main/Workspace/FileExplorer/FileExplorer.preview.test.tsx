import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  preview: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn(),
  navigate: vi.fn(),
  switchNotebook: vi.fn().mockResolvedValue(undefined),
  toggle: vi.fn(),
  files: [{ name: 'a.txt', path: 'assets/a.txt', type: 'file', size: 100, lastModified: 1234 }],
}));
vi.mock('@Hooks/useNotebookFileList', () => ({
  useNotebookFileList: () => ({
    state: { status: 'ready', files: fixture.files },
    refresh: fixture.refresh,
  }),
}));
vi.mock('@Store/previewStore', () => ({
  default: Object.assign(() => ({ error: null, isLoading: false }), {
    getState: () => ({
      previewMode: 'notebook',
      previewFile: fixture.preview,
      switchToNotebook: fixture.switchNotebook,
      changePreviewMode: fixture.toggle,
    }),
  }),
}));
vi.mock('@Store/routeStore', () => ({
  default: { getState: () => ({ navigateToWorkspace: fixture.navigate }) },
}));
vi.mock('@fluentui/react/lib/Icon', () => ({ Icon: () => null }));
vi.mock('@fluentui/react-file-type-icons', () => ({
  initializeFileTypeIcons: vi.fn(),
  getFileTypeIconProps: vi.fn(),
}));
vi.mock('antd', () => ({
  Dropdown: () => null,
  Tree: ({
    treeData,
    onSelect,
  }: {
    treeData: { key: string }[];
    onSelect: (keys: string[], info: { node: { key: string } }) => void;
  }) => (
    <button onClick={() => onSelect([treeData[0].key], { node: treeData[0] })}>Select file</button>
  ),
}));
import FileExplorer from './FileExplorer';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
beforeEach(() => {
  fixture.files = [
    { name: 'a.txt', path: 'assets/a.txt', type: 'file', size: 100, lastModified: 1234 },
  ];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
it('passes the selected path and modification marker without constructing an empty File', async () => {
  vi.stubGlobal('File', undefined);
  render(<FileExplorer notebookId="owner" />);
  fireEvent.click(screen.getByText('Select file'));
  expect(fixture.toggle).not.toHaveBeenCalled();
  expect(fixture.preview).toHaveBeenCalledExactlyOnceWith('owner', 'assets/a.txt', {
    file: { name: 'a.txt', path: 'assets/a.txt' },
    lastModified: 1234,
  });
});

it('leaves the current preview untouched when the selected file type is unsupported', () => {
  fixture.files[0] = { ...fixture.files[0], name: 'a.unsupported', path: 'a.unsupported' };
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  render(<FileExplorer notebookId="owner" />);
  fireEvent.click(screen.getByText('Select file'));
  expect(fixture.toggle).not.toHaveBeenCalled();
  expect(fixture.preview).not.toHaveBeenCalled();
  expect(fixture.switchNotebook).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('File Type Not Supported'));
});

it('navigates synchronously and delegates notebook mode to the preview lifecycle', () => {
  fixture.files[0] = { ...fixture.files[0], name: 'book.easynb', path: 'book.easynb' };
  render(<FileExplorer notebookId="owner" />);
  fireEvent.click(screen.getByText('Select file'));
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('owner');
  expect(fixture.switchNotebook).toHaveBeenCalledExactlyOnceWith('owner');
  expect(fixture.toggle).not.toHaveBeenCalled();
  expect(fixture.preview).not.toHaveBeenCalled();
});

it('handles a failed notebook switch without an unhandled rejection', async () => {
  fixture.files[0] = { ...fixture.files[0], name: 'book.easynb', path: 'book.easynb' };
  fixture.switchNotebook.mockRejectedValueOnce(new Error('switch failed'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  render(<FileExplorer notebookId="owner" />);
  fireEvent.click(screen.getByText('Select file'));
  await waitFor(() =>
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Notebook Switch Error - switch failed')
    )
  );
});
