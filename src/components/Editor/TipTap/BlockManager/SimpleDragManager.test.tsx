import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import useStore from '@Store/notebookStore';
import SimpleDragManager from './SimpleDragManager';

vi.mock('@/components/Editor/utils/markdownParser', () => ({
  parseMarkdownContent: (text: string) => text,
}));
vi.mock('../../utils/cellConverters', () => ({
  convertCellsToHtml: (text: string) => `<p>${text}</p>`,
}));
const initial = useStore.getState();
afterEach(() => {
  cleanup();
  useStore.setState(initial, true);
});
function setup() {
  useStore.setState({ notebookId: 'a' });
  const insertContent = vi.fn();
  const chain = {
    focus: () => chain,
    insertContent: (html: string) => {
      insertContent(html);
      return chain;
    },
    run: () => true,
  };
  const editor = { chain: () => chain, isDestroyed: false } as unknown as Editor;
  const view = render(
    <SimpleDragManager editor={editor}>
      <p>Editor</p>
    </SimpleDragManager>
  );
  let resolve!: (value: string) => void;
  const text = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      })
  );
  const file = { name: 'notes.md', text };
  fireEvent.drop(view.container.firstChild!, { dataTransfer: { files: [file], types: ['Files'] } });
  return { view, insertContent, text, editor, resolve: () => resolve('imported') };
}
it('inserts a Markdown drop after reading the file', async () => {
  const test = setup();
  await waitFor(() => expect(test.text).toHaveBeenCalledOnce());
  await act(async () => test.resolve());
  expect(test.insertContent).toHaveBeenCalledExactlyOnceWith('<p>imported</p>');
});
it.each(['unmount', 'switch', 'away-and-back', 'destroy', 'replace'])(
  'discards pending Markdown after %s',
  async (change) => {
    const test = setup();
    await waitFor(() => expect(test.text).toHaveBeenCalledOnce());
    act(() => {
      if (change === 'unmount') test.view.unmount();
      if (change === 'switch') useStore.setState({ notebookId: 'b' });
      if (change === 'away-and-back') {
        useStore.setState({ notebookId: 'b' });
        useStore.setState({ notebookId: 'a' });
      }
      if (change === 'destroy') Object.defineProperty(test.editor, 'isDestroyed', { value: true });
      if (change === 'replace')
        test.view.rerender(
          <SimpleDragManager editor={null}>
            <p>Closed</p>
          </SimpleDragManager>
        );
    });
    await act(async () => test.resolve());
    expect(test.insertContent).not.toHaveBeenCalled();
  }
);
it('admits a new drop after an away-and-back transition invalidates the old one', async () => {
  const test = setup();
  await waitFor(() => expect(test.text).toHaveBeenCalledOnce());
  act(() => {
    useStore.setState({ notebookId: 'b' });
    useStore.setState({ notebookId: 'a' });
  });
  await act(async () => test.resolve());
  fireEvent.drop(test.view.container.firstChild!, {
    dataTransfer: { files: [{ name: 'new.md', text: async () => 'new' }], types: ['Files'] },
  });
  await waitFor(() => expect(test.insertContent).toHaveBeenCalledExactlyOnceWith('<p>new</p>'));
});
