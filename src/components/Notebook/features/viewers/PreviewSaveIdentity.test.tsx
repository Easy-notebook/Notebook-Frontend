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
vi.mock('react-virtualized-auto-sizer', () => ({
  default: ({ children }: { children: (size: { width: number; height: number }) => ReactNode }) =>
    children({ width: 800, height: 400 }),
}));
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
  model.state.activeSplitFile = {
    ...model.state.activeFile,
    id: 'book::split.js',
    name: 'split.js',
    path: 'split.js',
    content: 'split',
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

it('saves XLSX as a readable workbook and retains undisplayed sheets', async () => {
  const XLSX = await import('xlsx-js-style');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Name', 'Value'],
      ['Ada', 42],
    ]),
    'Main'
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['other sheet']]), 'Other');
  const content = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string;
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::table.xlsx',
    name: 'table.xlsx',
    path: 'table.xlsx',
    type: 'xlsx',
    content,
  };
  render(<DataTable />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(model.state.updatePreviewFileContent).toHaveBeenCalledOnce());
  const [savedContent, target] = model.state.updatePreviewFileContent.mock.calls[0];
  const saved = XLSX.read(savedContent, { type: 'base64' });
  expect(target).toEqual({ surface: 'normal', fileId: 'book::table.xlsx' });
  expect(saved.SheetNames).toEqual(['Main', 'Other']);
  expect(saved.Sheets.Main.B2).toMatchObject({ t: 'n', v: 42 });
  expect(saved.Sheets.Other.A1.v).toBe('other sheet');
});

it('refuses to save a workbook whose current source could not be read', async () => {
  const { XlsxDocument } = await import('./data-table/XlsxDocument');
  const read = vi.spyOn(XlsxDocument, 'fromBase64').mockImplementation(() => {
    throw new Error('unreadable workbook');
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    model.state.activeFile = {
      ...model.state.activeFile,
      id: 'book::broken.xlsx',
      name: 'broken.xlsx',
      path: 'broken.xlsx',
      type: 'xlsx',
      content: 'unreadable',
    };
    render(<DataTable />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(model.state.updatePreviewFileContent).not.toHaveBeenCalled();
    expect(model.state.setTabDirty).not.toHaveBeenCalledWith('book::broken.xlsx', false);
  } finally {
    read.mockRestore();
    log.mockRestore();
  }
});

it('preserves empty rows when the CSV grid is saved', async () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::rows.csv',
    name: 'rows.csv',
    path: 'rows.csv',
    type: 'csv',
    content: 'first\n\nlast\n\n',
  };
  render(<DataTable />);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenCalledWith('first\n""\nlast\n""', {
    surface: 'normal',
    fileId: 'book::rows.csv',
  });
});

it('cannot overwrite malformed CSV with an empty grid after parsing fails', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    model.state.activeFile = {
      ...model.state.activeFile,
      id: 'book::bad.csv',
      name: 'bad.csv',
      path: 'bad.csv',
      type: 'csv',
      content: '"unterminated',
    };
    render(<DataTable />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(model.state.updatePreviewFileContent).not.toHaveBeenCalled();
    expect(model.state.setTabDirty).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

it('keeps edits made during a save when the store publishes that save result', async () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::table.csv',
    name: 'table.csv',
    path: 'table.csv',
    type: 'csv',
    content: 'name\nAda',
  };
  const view = render(<DataTable showFormulaBar={false} />);
  const insert = (position: 'Above' | 'Below') => {
    fireEvent.contextMenu(screen.getByText('Ada', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: `Insert Row ${position}` }));
  };
  insert('Above');
  let finish!: (file: typeof model.state.activeFile) => void;
  model.state.updatePreviewFileContent.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('name\n""\nAda', {
    surface: 'normal',
    fileId: 'book::table.csv',
  });
  insert('Below');
  model.state.setTabDirty.mockClear();
  model.state.activeFile = { ...model.state.activeFile, content: 'name\n""\nAda' };
  view.rerender(<DataTable showFormulaBar={false} />);
  await act(async () => {
    finish(model.state.activeFile);
  });
  expect(screen.getByText('Ada', { exact: true })).toBeDefined();
  expect(model.state.setTabDirty).not.toHaveBeenCalledWith('book::table.csv', false);
  model.state.updatePreviewFileContent.mockResolvedValueOnce({
    ...model.state.activeFile,
    content: 'name\n""\nAda\n""',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(model.state.setTabDirty).toHaveBeenCalledWith('book::table.csv', false)
  );
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('name\n""\nAda\n""', {
    surface: 'normal',
    fileId: 'book::table.csv',
  });
});

it('keeps the cell input mounted and focused through consecutive keystrokes', () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::table.csv',
    name: 'table.csv',
    path: 'table.csv',
    type: 'csv',
    content: 'name\nAda',
  };
  render(<DataTable showFormulaBar={false} />);
  fireEvent.doubleClick(screen.getByText('Ada', { exact: true }));
  const input = screen.getByRole('textbox') as HTMLInputElement;
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: 'Bob' } });
  expect(screen.getByRole('textbox')).toBe(input);
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: 'Bobby' } });
  expect(screen.getByRole('textbox')).toBe(input);
  fireEvent.blur(input);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('name\nBobby', {
    surface: 'normal',
    fileId: 'book::table.csv',
  });
});

it('reopening a context menu does not leave an old outside-click listener that closes the new menu', () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::table.csv',
    name: 'table.csv',
    path: 'table.csv',
    type: 'csv',
    content: 'name\nAda',
  };
  render(<DataTable />);
  fireEvent.contextMenu(screen.getByText('Ada', { exact: true }));
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('button', { name: 'Insert Row Above' })).toBeNull();
  fireEvent.contextMenu(screen.getByText('Ada', { exact: true }));
  const insert = screen.getByRole('button', { name: 'Insert Row Above' });
  fireEvent.mouseDown(insert);
  expect(screen.getByRole('button', { name: 'Insert Row Above' })).toBe(insert);
  fireEvent.click(insert);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('name\n""\nAda', {
    surface: 'normal',
    fileId: 'book::table.csv',
  });
});

it('releases context-menu listeners when an open table unmounts', () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::table.csv',
    name: 'table.csv',
    path: 'table.csv',
    type: 'csv',
    content: 'name\nAda',
  };
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  try {
    const view = render(<DataTable />);
    fireEvent.contextMenu(screen.getByText('Ada', { exact: true }));
    const listeners = add.mock.calls
      .filter(([event]) => event === 'mousedown')
      .map(([, listener]) => listener);
    expect(listeners).toHaveLength(1);
    view.unmount();
    for (const listener of listeners) expect(remove).toHaveBeenCalledWith('mousedown', listener);
  } finally {
    add.mockRestore();
    remove.mockRestore();
  }
});

it('edits the selected source row after sorting instead of the row at its display position', () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::sorted.csv',
    name: 'sorted.csv',
    path: 'sorted.csv',
    type: 'csv',
    content: 'Zulu,first\nAlpha,second',
  };
  render(<DataTable showFormulaBar={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sort column A' }));
  fireEvent.doubleClick(screen.getByText('Alpha', { exact: true }));
  const input = screen.getByRole('textbox') as HTMLInputElement;
  expect(input.value).toBe('Alpha');
  fireEvent.change(input, { target: { value: 'Bravo' } });
  fireEvent.blur(input);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith(
    'Zulu,first\nBravo,second',
    { surface: 'normal', fileId: 'book::sorted.csv' }
  );
});

it('keyboard navigation and range copy follow sorted visible rows', async () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::sorted.csv',
    name: 'sorted.csv',
    path: 'sorted.csv',
    type: 'csv',
    content: 'Zulu\nBravo\nAlpha',
  };
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    render(<DataTable showFormulaBar={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort column A' }));
    fireEvent.click(screen.getByText('Alpha', { exact: true }));
    fireEvent.keyDown(document, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Bravo');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    fireEvent.contextMenu(screen.getByText('Bravo', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: /^Copy/ }));
    expect(writeText).toHaveBeenCalledWith('Alpha\nBravo');
  } finally {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});

it('pastes consecutive rows in visible sorted order without changing unrelated source rows', async () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::sorted.csv',
    name: 'sorted.csv',
    path: 'sorted.csv',
    type: 'csv',
    content: 'Zulu\nBravo\nAlpha',
  };
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: vi.fn().mockResolvedValue('A1\nB1') },
  });
  try {
    render(<DataTable showFormulaBar={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sort column A' }));
    fireEvent.contextMenu(screen.getByText('Alpha', { exact: true }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Paste/ }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('Zulu\nB1\nA1', {
      surface: 'normal',
      fileId: 'book::sorted.csv',
    });
  } finally {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});

it.each(['navigation', 'newer edit', 'unmount'])(
  'ignores late clipboard text after %s',
  async (change) => {
    model.state.activeFile = {
      ...model.state.activeFile,
      id: 'book::paste.csv',
      name: 'paste.csv',
      path: 'paste.csv',
      type: 'csv',
      content: 'original',
    };
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let finish!: (text: string) => void;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              finish = resolve;
            })
        ),
      },
    });
    try {
      const view = render(<DataTable showFormulaBar={false} />);
      fireEvent.contextMenu(screen.getByText('original', { exact: true }));
      fireEvent.click(screen.getByRole('button', { name: /^Paste/ }));
      if (change === 'navigation') {
        model.state.activeFile = {
          ...model.state.activeFile,
          id: 'book::other.csv',
          name: 'other.csv',
          path: 'other.csv',
          content: 'newer',
        };
        view.rerender(<DataTable showFormulaBar={false} />);
      } else if (change === 'newer edit') {
        fireEvent.doubleClick(screen.getByText('original', { exact: true }));
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'newer' } });
        fireEvent.blur(input);
      } else view.unmount();
      model.state.setTabDirty.mockClear();
      await act(async () => {
        finish('obsolete clipboard');
      });
      expect(model.state.setTabDirty).not.toHaveBeenCalled();
      if (change !== 'unmount') {
        expect(screen.getByText('newer', { exact: true })).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('newer', {
          surface: 'normal',
          fileId: model.state.activeFile.id,
        });
      }
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  }
);

it('isolates editor history and open menus when the same file identity moves between preview surfaces', () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::table.csv',
    name: 'table.csv',
    path: 'table.csv',
    type: 'csv',
    content: 'name\nAda',
  };
  const view = render(<DataTable />);
  fireEvent.contextMenu(screen.getByText('Ada', { exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Insert Row Above' }));
  expect(
    (screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }) as HTMLButtonElement).disabled
  ).toBe(false);
  fireEvent.contextMenu(screen.getByText('Ada', { exact: true }));
  model.state.activeSplitFile = { ...model.state.activeFile, content: 'name\nGrace' };
  model.notebook.detachedCellId = 'cell';
  view.rerender(<DataTable />);
  expect(screen.getByText('Grace', { exact: true })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Insert Row Above' })).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }) as HTMLButtonElement).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('name\nGrace', {
    surface: 'split',
    fileId: 'book::table.csv',
  });
});

it('undoes and redoes cell edits, then discards redo when a new edit branches from history', () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::history.csv',
    name: 'history.csv',
    path: 'history.csv',
    type: 'csv',
    content: 'Ada',
  };
  render(<DataTable showFormulaBar={false} />);
  const edit = (old: string, next: string) => {
    fireEvent.doubleClick(screen.getByText(old, { exact: true }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: next } });
    fireEvent.blur(input);
  };
  edit('Ada', 'Bob');
  fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
  expect(screen.getByText('Ada', { exact: true })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Redo (Ctrl+Y)' }));
  expect(screen.getByText('Bob', { exact: true })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
  edit('Ada', 'Carol');
  expect(
    (screen.getByRole('button', { name: 'Redo (Ctrl+Y)' }) as HTMLButtonElement).disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('Carol', {
    surface: 'normal',
    fileId: 'book::history.csv',
  });
});

it('undoes column insertion as one atomic change of both columns and cell values', () => {
  model.state.activeFile = {
    ...model.state.activeFile,
    id: 'book::columns.csv',
    name: 'columns.csv',
    path: 'columns.csv',
    type: 'csv',
    content: 'left,right',
  };
  render(<DataTable showFormulaBar={false} />);
  fireEvent.contextMenu(screen.getByText('left', { exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Insert Column Right' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('left,"",right', {
    surface: 'normal',
    fileId: 'book::columns.csv',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('left,right', {
    surface: 'normal',
    fileId: 'book::columns.csv',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Redo (Ctrl+Y)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(model.state.updatePreviewFileContent).toHaveBeenLastCalledWith('left,"",right', {
    surface: 'normal',
    fileId: 'book::columns.csv',
  });
});

it.each(['Row Above', 'Column Left'])(
  'moves custom cell formatting with content when inserting %s',
  (operation) => {
    model.state.activeFile = {
      ...model.state.activeFile,
      id: 'book::format.csv',
      name: 'format.csv',
      path: 'format.csv',
      type: 'csv',
      content: 'Ada,first\nGrace,second',
    };
    render(<DataTable showFormulaBar={false} />);
    fireEvent.click(screen.getByText('Ada', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Bold (Ctrl+B)' }));
    expect(screen.getByText('Ada', { exact: true }).closest('div')?.style.fontWeight).toBe('700');
    fireEvent.contextMenu(screen.getByText('Ada', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: `Insert ${operation}` }));
    expect(screen.getByText('Ada', { exact: true }).closest('div')?.style.fontWeight).toBe('700');
    expect(screen.getByText('Grace', { exact: true }).closest('div')?.style.fontWeight).not.toBe(
      '700'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo (Ctrl+Z)' }));
    expect(screen.getByText('Ada', { exact: true }).closest('div')?.style.fontWeight).toBe('700');
  }
);
