import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import useStore from '@Store/notebookStore';
import { getTipTapExtensions } from '../config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from '../../utils/cellConverters';
import { reconcileSourceTransaction } from '../model/NotebookSourceStep';
import { NotebookSourceButton } from './NotebookSourceButton';
import { EditorReadOnlyContext } from '../../EditorAccessContext';
import { SourceDraftHistory } from '../../model/SourceDraftHistory';

let editor: Editor;
let view: ReturnType<typeof render>;
let original: ReturnType<typeof useStore.getState>;
beforeEach(() => {
  original = useStore.getState();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  useStore.getState().setCells([
    { id: 'title', type: 'markdown', content: '# Notebook' },
    { id: 'code', type: 'code', content: 'print(1)', language: 'python' },
  ]);
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: convertCellsToHtml(useStore.getState().cells),
    onUpdate: ({ editor, transaction }) =>
      useStore
        .getState()
        .setCells(
          reconcileSourceTransaction(
            convertEditorStateToCells(editor),
            useStore.getState().cells,
            transaction.steps
          )
        ),
  });
  view = render(
    <EditorReadOnlyContext.Provider value={false}>
      <NotebookSourceButton editor={editor} />
    </EditorReadOnlyContext.Provider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Notebook source' }));
});
afterEach(() => {
  cleanup();
  editor.destroy();
  useStore.setState(original, true);
});

it('protects unapplied source edits on page exit and clears protection after draft undo or cancel', () => {
  const warned = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const original = input.value;
  expect(warned()).toBe(false);
  fireEvent.change(input, { target: { value: original.replace('print(1)', 'print(2)') } });
  expect(warned()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Undo draft' }));
  expect(input.value).toBe(original);
  expect(warned()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Redo draft' }));
  expect(warned()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(warned()).toBe(false);
  expect(useStore.getState().cells[1].content).toBe('print(1)');
});

it('records ordinary beforeinput typing as known ranges without full-buffer diffing', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const original = input.value;
  const start = original.indexOf('print(1)');
  input.setSelectionRange(start, start + 8, 'backward');
  const diff = vi.spyOn(SourceDraftHistory.prototype, 'edit');
  try {
    for (const data of ['x', 'y']) {
      const event = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(input.value).toBe(original.replace('print(1)', 'xy'));
    expect(input.selectionStart).toBe(start + 2);
    expect(diff).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(input.value).toBe(original.replace('print(1)', 'x'));
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(input.value).toBe(original);
    expect(input.selectionDirection).toBe('backward');
  } finally {
    diff.mockRestore();
  }
});

it.each(['insertLineBreak', 'insertParagraph'])(
  'records %s without scanning the full buffer',
  (inputType) => {
    const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    const original = input.value;
    const start = original.indexOf('print(1)');
    input.setSelectionRange(start, start);
    const diff = vi.spyOn(SourceDraftHistory.prototype, 'edit');
    try {
      const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(true);
      expect(input.value).toBe(original.slice(0, start) + '\n' + original.slice(start));
      expect(input.selectionStart).toBe(start + 1);
      expect(diff).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
      expect(input.value).toBe(original);
    } finally {
      diff.mockRestore();
    }
  }
);

it.each(['deleteContentBackward', 'deleteContentForward'])(
  'leaves collapsed %s to browser character-boundary handling',
  (inputType) => {
    const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    const original = input.value;
    input.setSelectionRange(5, 5);
    const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(false);
    expect(input.value).toBe(original);
  }
);

it.each(['deleteContentBackward', 'deleteContentForward', 'deleteByCut'])(
  'records selected-range %s with exact undo',
  (inputType) => {
    const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    const original = input.value;
    const start = original.indexOf('print(1)');
    input.setSelectionRange(start, start + 8, 'backward');
    const diff = vi.spyOn(SourceDraftHistory.prototype, 'edit');
    try {
      const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(true);
      expect(input.value).toBe(original.replace('print(1)', ''));
      expect(input.selectionStart).toBe(start);
      expect(diff).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
      expect(input.value).toBe(original);
      expect(input.selectionDirection).toBe('backward');
    } finally {
      diff.mockRestore();
    }
  }
);

it.each([{ cancelable: false }, { cancelable: true, isComposing: true }])(
  'leaves browser-owned input untouched: %o',
  (options) => {
    const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    const original = input.value;
    const event = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: '中',
      bubbles: true,
      ...options,
    });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(false);
    expect(input.value).toBe(original);
  }
);

it.each([
  { key: 'z', metaKey: true },
  { key: 'z', ctrlKey: true },
  { key: 'Z', metaKey: true, shiftKey: true },
  { key: 'Enter', isComposing: true },
  { key: 'Tab' },
])(
  'isolates draft keyboard input while retaining native Tab and composition behavior: %o',
  (init) => {
    const globalShortcut = vi.fn();
    document.addEventListener('keydown', globalShortcut);
    try {
      const input = screen.getByRole('textbox', { name: 'Notebook source' });
      const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
      fireEvent(input, event);
      expect(globalShortcut).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(init.key.toLowerCase() === 'z');
    } finally {
      document.removeEventListener('keydown', globalShortcut);
    }
  }
);

it.each(['Python', 'markdown', 'raw'])(
  'appends only the new %s section to the native source input',
  (type) => {
    const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    const original = input.value;
    const cells = useStore.getState().cells;
    const replace = vi.spyOn(input, 'setRangeText');
    const assign = vi.spyOn(input, 'value', 'set');
    fireEvent.click(screen.getByRole('button', { name: `Add ${type}` }));
    const appended = input.value;
    expect(appended.startsWith(original)).toBe(true);
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      appended.slice(original.length),
      original.length,
      original.length,
      'preserve'
    );
    expect(assign).not.toHaveBeenCalled();
    expect(input.selectionStart).toBe(input.selectionEnd);
    expect(input.selectionStart).toBeGreaterThan(original.length);
    expect(document.activeElement).toBe(input);
    expect(useStore.getState().cells).toBe(cells);
    fireEvent.click(screen.getByRole('button', { name: 'Undo draft' }));
    expect(input.value).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Redo draft' }));
    expect(input.value).toBe(appended);
  }
);

it('writes only the known indentation range into the native source input', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const original = input.value;
  const start = original.indexOf('print(1)');
  const replace = vi.spyOn(input, 'setRangeText');
  input.setSelectionRange(start, start + 1, 'backward');
  fireEvent.keyDown(input, { key: ']', ctrlKey: true });
  expect(replace).toHaveBeenCalledExactlyOnceWith('  p', start, start + 1, 'preserve');
  expect(input.selectionStart).toBe(start + 2);
  expect(input.selectionEnd).toBe(start + 3);
  expect(input.selectionDirection).toBe('backward');
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(input.value).toBe(original);
});

it.each(['keyboard', 'native', 'button'])(
  'writes only changed ranges for %s undo and redo',
  (channel) => {
    const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    const original = input.value;
    const start = original.indexOf('print(1)');
    input.setSelectionRange(start, start);
    fireEvent(
      input,
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'X',
        bubbles: true,
        cancelable: true,
      })
    );
    const replace = vi.spyOn(input, 'setRangeText');
    const step = (undo: boolean) => {
      if (channel === 'keyboard')
        fireEvent.keyDown(input, { key: 'z', ctrlKey: true, shiftKey: !undo });
      else if (channel === 'native')
        fireEvent(
          input,
          new InputEvent('beforeinput', {
            inputType: undo ? 'historyUndo' : 'historyRedo',
            bubbles: true,
            cancelable: true,
          })
        );
      else
        fireEvent.click(screen.getByRole('button', { name: undo ? 'Undo draft' : 'Redo draft' }));
    };
    step(true);
    expect(replace).toHaveBeenCalledExactlyOnceWith('', start, start + 1, 'preserve');
    expect(input.value).toBe(original);
    replace.mockClear();
    step(false);
    expect(replace).toHaveBeenCalledExactlyOnceWith('X', start, start, 'preserve');
    expect(input.value).toBe(original.slice(0, start) + 'X' + original.slice(start));
  }
);

it('undoes indentation and added cells within the draft without changing the live notebook', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const original = input.value;
  const cells = useStore.getState().cells;
  const start = original.indexOf('print(1)');
  input.setSelectionRange(start, start + 8, 'backward');
  fireEvent.keyDown(input, { key: ']', ctrlKey: true });
  const indented = input.value;
  expect(indented).toContain('  print(1)');
  expect(input.selectionDirection).toBe('backward');
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(input.value).toBe(original);
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true, shiftKey: true });
  expect(input.value).toBe(indented);
  fireEvent.click(screen.getByRole('button', { name: 'Add Python' }));
  expect(input.value.length).toBeGreaterThan(indented.length);
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(input.value).toBe(indented);
  expect(useStore.getState().cells).toBe(cells);
});

it('keeps a composing draft intact when cancel is requested by its button', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(2)') } });
  const draft = input.value;
  fireEvent.compositionStart(input);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('textbox', { name: 'Notebook source' })).toBe(input);
  expect(input.value).toBe(draft);
  fireEvent.compositionEnd(input);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('textbox', { name: 'Notebook source' })).toBeNull();
  expect(useStore.getState().cells[1].content).toBe('print(1)');
});

it('keeps a composing draft intact when apply, add or undo is requested', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const cells = useStore.getState().cells;
  const changed = input.value.replace('print(1)', 'print("中文")');
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: changed } });
  for (const name of ['Undo draft', 'Add Python', 'Apply source']) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('textbox', { name: 'Notebook source' })).toBe(input);
    expect(input.value).toBe(changed);
    expect(useStore.getState().cells).toBe(cells);
  }
  fireEvent.compositionEnd(input);
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.queryByRole('textbox', { name: 'Notebook source' })).toBeNull();
  expect(useStore.getState().cells.find((cell) => cell.id === 'code')?.content).toBe(
    'print("中文")'
  );
});

it('freezes the open draft when access becomes read-only and preserves it for later editing', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const draft = input.value.replace('print(1)', 'print(2)');
  fireEvent.change(input, { target: { value: draft } });
  view.rerender(
    <EditorReadOnlyContext.Provider value={true}>
      <NotebookSourceButton editor={editor} />
    </EditorReadOnlyContext.Provider>
  );
  expect(input.readOnly).toBe(true);
  fireEvent.change(input, { target: { value: 'unauthorized edit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Python' }));
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  view.rerender(
    <EditorReadOnlyContext.Provider value={false}>
      <NotebookSourceButton editor={editor} />
    </EditorReadOnlyContext.Provider>
  );
  expect(input.value).toBe(draft);
  fireEvent.click(screen.getByRole('button', { name: 'Undo draft' }));
  expect(input.value).toContain('print(1)');
});

it('undoes a paste separately from typing before and after it', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const original = input.value;
  fireEvent.input(input, { target: { value: original + 'a' }, inputType: 'insertText' });
  fireEvent.input(input, { target: { value: original + 'aPASTE' }, inputType: 'insertFromPaste' });
  fireEvent.input(input, { target: { value: original + 'aPASTEb' }, inputType: 'insertText' });
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(input.value).toBe(original + 'aPASTE');
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(input.value).toBe(original + 'a');
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(input.value).toBe(original);
});

it('routes native history input events through the same draft history', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const original = input.value;
  fireEvent.change(input, { target: { value: original.replace('print(1)', 'print(2)') } });
  const undo = new InputEvent('beforeinput', {
    inputType: 'historyUndo',
    bubbles: true,
    cancelable: true,
  });
  fireEvent(input, undo);
  expect(undo.defaultPrevented).toBe(true);
  expect(input.value).toBe(original);
  const redo = new InputEvent('beforeinput', {
    inputType: 'historyRedo',
    bubbles: true,
    cancelable: true,
  });
  fireEvent(input, redo);
  expect(redo.defaultPrevented).toBe(true);
  expect(input.value).toContain('print(2)');
  expect(useStore.getState().cells[1].content).toBe('print(1)');
});

it('keeps the active source session when its trigger is invoked again', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(2)') } });
  fireEvent.click(screen.getByRole('button', { name: 'Notebook source' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Python' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(input.value).toContain('print(2)');
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(useStore.getState().cells).toHaveLength(3);
  expect(useStore.getState().cells[1].content).toBe('print(2)');
});

it.each(['forward', 'backward', 'none'] as const)(
  'resumes a draft with its %s selection, viewport and undo history after remount',
  (direction) => {
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    act(() => useStore.setState({ notebookId: 'source-navigation-test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notebook source' }));
    const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(2)') } });
    const edited = input.value;
    const start = edited.indexOf('print(2)');
    const end = direction === 'none' ? start : start + 8;
    input.setSelectionRange(start, end, direction);
    fireEvent.select(input);
    input.scrollTop = 230;
    input.scrollLeft = 45;
    view.unmount();
    view = render(
      <EditorReadOnlyContext.Provider value={false}>
        <NotebookSourceButton editor={editor} />
      </EditorReadOnlyContext.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Notebook source' }));
    const resumed = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    expect(resumed.value).toBe(edited);
    expect(document.activeElement).toBe(resumed);
    expect([resumed.selectionStart, resumed.selectionEnd]).toEqual([start, end]);
    if (direction !== 'none') expect(resumed.selectionDirection).toBe(direction);
    expect([resumed.scrollTop, resumed.scrollLeft]).toEqual([230, 45]);
    expect((screen.getByRole('button', { name: 'Undo draft' }) as HTMLButtonElement).disabled).toBe(
      false
    );
    expect(useStore.getState().cells[1].content).toBe('print(1)');
    fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
    expect(useStore.getState().cells[1].content).toBe('print(2)');
  }
);

it.each(['Cancel', 'Apply source'])('opens a fresh source history after %s', (action) => {
  const trigger = screen.getByRole('button', { name: 'Notebook source' }) as HTMLButtonElement;
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(2)') } });
  input.setSelectionRange(10, 20, 'backward');
  input.scrollTop = 230;
  input.scrollLeft = 45;
  expect(trigger.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: action }));
  expect(trigger.disabled).toBe(false);
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  const reopened = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  expect([
    reopened.selectionStart,
    reopened.selectionEnd,
    reopened.scrollTop,
    reopened.scrollLeft,
  ]).toEqual([0, 0, 0, 0]);
  expect(reopened.value).toContain(action === 'Cancel' ? 'print(1)' : 'print(2)');
  expect((screen.getByRole('button', { name: 'Undo draft' }) as HTMLButtonElement).disabled).toBe(
    true
  );
  expect((screen.getByRole('button', { name: 'Redo draft' }) as HTMLButtonElement).disabled).toBe(
    true
  );
});

it('keeps original CRLF cell bytes after normalized source indentation is undone', () => {
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  act(() => useStore.getState().updateCell('code', 'print(1)\r\nprint(2)\r\n'));
  const before = useStore.getState().cells;
  fireEvent.click(screen.getByRole('button', { name: 'Notebook source' }));
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  expect(input.value).not.toContain('\r');
  const start = input.value.indexOf('print(1)');
  input.setSelectionRange(start, start + 'print(1)\nprint(2)'.length);
  fireEvent.keyDown(input, { key: ']', ctrlKey: true });
  expect(input.value).toContain('  print(1)\n  print(2)');
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(useStore.getState().cells).toBe(before);
  expect(useStore.getState().cells[1].content).toBe('print(1)\r\nprint(2)\r\n');
});

it('exposes draft undo/redo state and restores textarea focus from toolbar controls', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const original = input.value;
  const undo = screen.getByRole('button', { name: 'Undo draft' }) as HTMLButtonElement;
  const redo = screen.getByRole('button', { name: 'Redo draft' }) as HTMLButtonElement;
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Add Python' }));
  const added = input.value;
  expect(undo.disabled).toBe(false);
  fireEvent.click(undo);
  expect(input.value).toBe(original);
  expect(document.activeElement).toBe(input);
  expect(undo.disabled).toBe(true);
  expect(redo.disabled).toBe(false);
  fireEvent.click(redo);
  expect(input.value).toBe(added);
  expect(redo.disabled).toBe(true);
  expect(useStore.getState().cells).toHaveLength(2);
});

it('restores the original backward selection when undoing a replacement', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  const original = input.value;
  const start = original.indexOf('print(1)');
  input.setSelectionRange(start, start + 8, 'backward');
  fireEvent(
    input,
    new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: '中文',
      bubbles: true,
      cancelable: true,
    })
  );
  fireEvent.change(input, {
    target: {
      value: original.slice(0, start) + '中文' + original.slice(start + 8),
      selectionStart: start + 2,
      selectionEnd: start + 2,
    },
  });
  fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
  expect(input.value).toBe(original);
  expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
    start,
    start + 8,
    'backward',
  ]);
});

it.each([{ isComposing: true }, { keyCode: 229 }])(
  'leaves draft history and indentation untouched during composition: %j',
  (composition) => {
    const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
    const changed = input.value.replace('print(1)', 'print(2)');
    fireEvent.change(input, { target: { value: changed } });
    for (const key of ['z', '[', ']']) {
      const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        ...composition,
      });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(false);
      expect(input.value).toBe(changed);
    }
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(input.value).toContain('print(1)');
  }
);

it('edits and inserts cells, applies once and supports document undo', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(2)') } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Python' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.queryByRole('textbox', { name: 'Notebook source' })).toBeNull();
  expect(useStore.getState().cells[1].content).toBe('print(2)');
  expect(useStore.getState().cells).toHaveLength(3);
  act(() => {
    editor.commands.undo();
  });
  expect(useStore.getState().cells[1].content).toBe('print(1)');
  expect(useStore.getState().cells).toHaveLength(2);
});
it.each(['markdown', 'Python', 'raw'])('focuses the editable body after adding %s', (label) => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.click(screen.getByRole('button', { name: `Add ${label}` }));
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(input.selectionEnd);
  const cursor = input.selectionStart;
  const text = label === 'Python' ? 'print(42)' : 'new content';
  fireEvent.change(input, {
    target: { value: input.value.slice(0, cursor) + text + input.value.slice(cursor) },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(useStore.getState().cells[2]).toMatchObject({
    type: label === 'Python' ? 'code' : label,
    content: text,
  });
});
it('retains conflicted drafts and cancellation leaves live changes untouched', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(2)') } });
  act(() => useStore.getState().updateCell('code', 'external'));
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.getByRole('alert').textContent).toContain('concurrently');
  expect(input.value).toContain('print(2)');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(useStore.getState().cells[1].content).toBe('external');
});
it('keeps the draft and rejects apply after the editor becomes read-only', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(2)') } });
  act(() => editor.setEditable(false));
  const before = useStore.getState().cells;
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.getByRole('alert').textContent).toContain('not editable');
  expect(input.value).toContain('print(2)');
  expect(useStore.getState().cells).toBe(before);
  act(() => editor.setEditable(true));
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(useStore.getState().cells[1].content).toBe('print(2)');
});
it('does not apply an open draft to another notebook', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(2)') } });
  act(() => useStore.setState({ notebookId: 'different-notebook' }));
  const before = useStore.getState().cells;
  const document = editor.state.doc;
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.getByRole('alert').textContent).toContain('active notebook changed');
  expect(input.value).toContain('print(2)');
  expect(useStore.getState().cells).toBe(before);
  expect(editor.state.doc).toBe(document);
});
it('retains an open draft when the surrounding access context becomes read-only', () => {
  const input = screen.getByRole('textbox', { name: 'Notebook source' }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: input.value.replace('print(1)', 'print(9)') } });
  view.rerender(
    <EditorReadOnlyContext.Provider value={true}>
      <NotebookSourceButton editor={editor} />
    </EditorReadOnlyContext.Provider>
  );
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input.value).toContain('print(9)');
  expect(screen.queryByRole('button', { name: 'Notebook source' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Apply source' }));
  expect(screen.getByRole('alert').textContent).toContain('not editable');
  expect(useStore.getState().cells[1].content).toBe('print(1)');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('textbox')).toBeNull();
});
