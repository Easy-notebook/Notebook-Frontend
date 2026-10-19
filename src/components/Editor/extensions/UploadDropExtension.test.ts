import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import useStore from '@Store/notebookStore';
import { handleFileUpload } from '@Utils/fileUtils';
import { fileUploadClient } from '@Services/notebook/FileUploadClient';
import { UploadDropExtension } from './UploadDropExtension';
vi.mock('@Utils/fileUtils', () => ({ handleFileUpload: vi.fn().mockResolvedValue(undefined) }));
let editor: Editor | undefined;
const initial = useStore.getState();
afterEach(() => {
  editor?.destroy();
  editor = undefined;
  useStore.setState(initial, true);
  vi.clearAllMocks();
});

it.each(['drop', 'paste'] as const)('supplies the shared upload client for %s events', (kind) => {
  useStore.setState({ notebookId: 'owner' });
  editor = new Editor({ extensions: [StarterKit, UploadDropExtension], content: '<p>Test</p>' });
  const file = new File(['text'], 'note.txt', { type: 'text/plain' });
  const event = new Event(kind, { bubbles: true, cancelable: true });
  Object.defineProperty(event, kind === 'drop' ? 'dataTransfer' : 'clipboardData', {
    value: { files: [file], getData: () => '' },
  });
  editor.view.dom.dispatchEvent(event);
  expect(handleFileUpload).toHaveBeenCalledWith(
    expect.objectContaining({ notebookId: 'owner', files: [file], fileService: fileUploadClient })
  );
  expect(event.defaultPrevented).toBe(true);
});

it.each(['switch', 'destroy'] as const)(
  'invalidates pending independent upload controls on editor %s',
  async (event) => {
    useStore.setState({ notebookId: 'owner' });
    editor = new Editor({ extensions: [StarterKit, UploadDropExtension], content: '<p>Test</p>' });
    let finish!: () => void;
    vi.mocked(handleFileUpload).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [new File(['a'], 'a.txt')], getData: () => '' },
    });
    editor.view.dom.dispatchEvent(drop);
    const control = vi.mocked(handleFileUpload).mock.calls[0][0].abortControllerRef;
    const controller = new AbortController();
    control.current = controller;
    if (event === 'switch') useStore.setState({ notebookId: 'other' });
    else {
      editor.destroy();
      editor = undefined;
    }
    expect(controller.signal.aborted).toBe(true);
    expect(control.current).toBeNull();
    const late = new AbortController();
    control.current = late;
    expect(late.signal.aborted).toBe(true);
    expect(control.current).toBeNull();
    finish();
    await Promise.resolve();
  }
);
