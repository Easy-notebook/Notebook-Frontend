import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  preview: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn(),
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
    getState: () => ({ previewMode: 'file', previewFile: fixture.preview }),
  }),
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
});
it('passes the selected path and modification marker without constructing an empty File', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('File', undefined);
  render(<FileExplorer notebookId="owner" />);
  fireEvent.click(screen.getByText('Select file'));
  expect(fixture.preview).toHaveBeenCalledExactlyOnceWith('owner', 'assets/a.txt', {
    file: { name: 'a.txt', path: 'assets/a.txt' },
    lastModified: 1234,
  });
});
