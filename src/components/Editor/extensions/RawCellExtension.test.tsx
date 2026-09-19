import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorReadOnlyContext } from '../EditorAccessContext';

const state = vi.hoisted(() => ({ cells: [] as any[], updateCell: vi.fn() }));
vi.mock('@Store/notebookStore', () => ({
  default: Object.assign((selector: any) => selector(state), { getState: () => state }),
}));
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children }: any) => <div>{children}</div>,
  ReactNodeViewRenderer: vi.fn(),
}));
import { RawCellView } from './RawCellExtension';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { RawCellExtension } from './RawCellExtension';
import { undoDepth } from '@tiptap/pm/history';
afterEach(() => {
  cleanup();
  state.cells = [];
  vi.clearAllMocks();
});

it.each(['converted', 'deleted', 'edited'])(
  'rejects a raw save after the live cell was %s before React refreshed',
  (change) => {
    state.cells = [{ id: 'raw', type: 'raw', content: 'original' }];
    const updateAttributes = vi.fn();
    render(
      <RawCellView
        node={{ attrs: { cellId: 'raw', content: 'original' } }}
        editor={{ commands: { command: vi.fn() } }}
        updateAttributes={updateAttributes}
        deleteNode={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'local draft' } });
    state.cells =
      change === 'deleted'
        ? []
        : [
            {
              id: 'raw',
              type: change === 'converted' ? 'code' : 'raw',
              content: change === 'edited' ? 'external' : 'original',
            },
          ];
    fireEvent.blur(screen.getByRole('textbox'));
    expect(state.updateCell).not.toHaveBeenCalled();
    expect(updateAttributes).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('local draft');
    expect(screen.getByRole('alert')).toBeDefined();
  }
);

it('does not transfer a draft to a different cell when a node view is reused', () => {
  const updateAttributes = vi.fn();
  const props = { updateAttributes, deleteNode: vi.fn() };
  const view = render(
    <RawCellView {...props} node={{ attrs: { cellId: 'first', content: 'same base' } }} />
  );
  fireEvent.click(screen.getByTitle('Edit'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'first cell draft' } });
  view.rerender(
    <RawCellView {...props} node={{ attrs: { cellId: 'second', content: 'same base' } }} />
  );
  fireEvent.blur(screen.getByRole('textbox'));
  expect(state.updateCell).not.toHaveBeenCalled();
  expect(updateAttributes).not.toHaveBeenCalled();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('first cell draft');
  expect(screen.getByRole('alert').textContent).toContain('identity');
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(screen.getByText('same base')).toBeDefined();
});

it('retains node content before store hydration', () => {
  const updateAttributes = vi.fn();
  render(
    <RawCellView
      node={{ attrs: { cellId: 'raw', content: 'keep me' } }}
      updateAttributes={updateAttributes}
      deleteNode={vi.fn()}
    />
  );
  expect(screen.getByText('keep me')).toBeDefined();
  expect(updateAttributes).not.toHaveBeenCalled();
});
it('synchronizes external content without creating an undo entry', () => {
  const editor = new Editor({
    extensions: [
      StarterKit,
      RawCellExtension.extend({
        addNodeView() {
          return () => ({ dom: document.createElement('div') });
        },
      }),
    ],
    content: {
      type: 'doc',
      content: [{ type: 'rawBlock', attrs: { cellId: 'raw', content: 'before' } }],
    },
  });
  state.cells = [{ id: 'raw', type: 'raw', content: 'external' }];
  const transactions: any[] = [];
  editor.on('transaction', ({ transaction }) => transactions.push(transaction));
  try {
    render(
      <RawCellView
        node={editor.state.doc.firstChild}
        editor={editor}
        getPos={() => 0}
        updateAttributes={vi.fn()}
        deleteNode={vi.fn()}
      />
    );
    expect(editor.state.doc.firstChild?.attrs.content).toBe('external');
    expect(undoDepth(editor.state)).toBe(0);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].getMeta('externalCellSync')).toBe(true);
    expect(state.updateCell).not.toHaveBeenCalled();
  } finally {
    cleanup();
    editor.destroy();
  }
});
it('does not reset an active draft when node attributes refresh', () => {
  const updateAttributes = vi.fn();
  const props = { updateAttributes, deleteNode: vi.fn() };
  const view = render(
    <RawCellView {...props} node={{ attrs: { cellId: 'raw', content: 'original' } }} />
  );
  fireEvent.click(screen.getByTitle('Edit'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'draft' } });
  view.rerender(
    <RawCellView {...props} node={{ attrs: { cellId: 'raw', content: 'external' } }} />
  );
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('draft');
  fireEvent.blur(screen.getByRole('textbox'));
  expect(state.updateCell).not.toHaveBeenCalled();
  expect(updateAttributes).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('Content changed');
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('draft');
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText('external')).toBeDefined();
});
it('does not offer editing or deletion in a read-only notebook', () => {
  render(
    <EditorReadOnlyContext.Provider value={true}>
      <RawCellView
        node={{ attrs: { cellId: 'raw', content: 'read me' } }}
        updateAttributes={vi.fn()}
        deleteNode={vi.fn()}
      />
    </EditorReadOnlyContext.Provider>
  );
  fireEvent.doubleClick(screen.getByText('read me'));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});
it('retains an edited raw draft when access becomes read-only before blur', () => {
  const props = {
    node: { attrs: { cellId: 'raw', content: 'original' } },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
  };
  const renderView = (readOnly: boolean) => (
    <EditorReadOnlyContext.Provider value={readOnly}>
      <RawCellView {...props} />
    </EditorReadOnlyContext.Provider>
  );
  const view = render(renderView(false));
  fireEvent.click(screen.getByTitle('Edit'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'unsaved draft' } });
  view.rerender(renderView(true));
  fireEvent.blur(screen.getByRole('textbox'));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('unsaved draft');
  expect(screen.getByRole('alert').textContent).toContain('not editable');
  expect(state.updateCell).not.toHaveBeenCalled();
  expect(props.updateAttributes).not.toHaveBeenCalled();
  view.rerender(renderView(false));
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
  expect(state.updateCell).toHaveBeenCalledExactlyOnceWith('raw', 'unsaved draft');
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('saves a changed draft and skips unchanged blur writes', () => {
  const updateAttributes = vi.fn();
  render(
    <RawCellView
      node={{ attrs: { cellId: 'raw', content: 'original' } }}
      updateAttributes={updateAttributes}
      deleteNode={vi.fn()}
    />
  );
  fireEvent.click(screen.getByTitle('Edit'));
  expect(document.activeElement).toBe(screen.getByRole('textbox'));
  fireEvent.blur(screen.getByRole('textbox'));
  expect(state.updateCell).not.toHaveBeenCalled();
  expect(updateAttributes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTitle('Edit'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'changed' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
  expect(state.updateCell).toHaveBeenCalledExactlyOnceWith('raw', 'changed');
  expect(updateAttributes).toHaveBeenCalledExactlyOnceWith({ cellId: 'raw', content: 'changed' });
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('does not overwrite concurrent content when the local draft was untouched', () => {
  const updateAttributes = vi.fn();
  const props = { updateAttributes, deleteNode: vi.fn() };
  const view = render(
    <RawCellView {...props} node={{ attrs: { cellId: 'raw', content: 'original' } }} />
  );
  fireEvent.click(screen.getByTitle('Edit'));
  view.rerender(
    <RawCellView {...props} node={{ attrs: { cellId: 'raw', content: 'external' } }} />
  );
  fireEvent.blur(screen.getByRole('textbox'));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(state.updateCell).not.toHaveBeenCalled();
  expect(updateAttributes).not.toHaveBeenCalled();
  expect(screen.getByText('external')).toBeDefined();
});
it.each([{ isComposing: true }, { keyCode: 229 }])(
  'does not save or discard a raw draft during composition: %j',
  (composition) => {
    render(
      <RawCellView
        node={{ attrs: { cellId: 'raw', content: 'original' } }}
        updateAttributes={vi.fn()}
        deleteNode={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '中文草稿' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true, ...composition });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape', ...composition });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('中文草稿');
    expect(state.updateCell).not.toHaveBeenCalled();
  }
);
