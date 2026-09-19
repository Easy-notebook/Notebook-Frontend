import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import TipTapSlashCommands from './TipTapSlashCommands';

afterEach(cleanup);

function setup() {
  const dom = document.createElement('div');
  const source = document.createElement('textarea');
  dom.append(source);
  document.body.append(dom);
  const run = vi.fn();
  const chain = { focus: () => chain, setParagraph: () => chain, run };
  const editor = {
    view: { dom },
    isEditable: true,
    isDestroyed: false,
    chain: () => chain,
  } as unknown as Editor;
  const close = vi.fn();
  const query = vi.fn();
  const view = render(
    <TipTapSlashCommands
      editor={editor}
      isOpen
      onClose={close}
      position={{ x: 0, y: 0 }}
      onQueryUpdate={query}
    />
  );
  return { dom, source, editor, run, close, query, menu: view.container.firstElementChild! };
}

it('ignores keys from source inputs and unrelated modal controls', () => {
  const state = setup();
  const dialog = document.createElement('dialog');
  const input = document.createElement('textarea');
  dialog.append(input);
  document.body.append(dialog);
  try {
    for (const target of [state.source, input]) {
      for (const key of ['ArrowDown', 'Enter', 'Backspace', 'Tab', 'x']) {
        expect(fireEvent.keyDown(target, { key })).toBe(true);
      }
    }
    expect(state.run).not.toHaveBeenCalled();
    expect(state.close).not.toHaveBeenCalled();
    expect(state.query).not.toHaveBeenCalled();
  } finally {
    state.dom.remove();
    dialog.remove();
  }
});

it('leaves composition confirmation alone but executes an owned non-composing Enter', () => {
  const state = setup();
  try {
    expect(fireEvent.keyDown(state.menu, { key: 'Enter', isComposing: true })).toBe(true);
    expect(fireEvent.keyDown(state.menu, { key: 'Enter', keyCode: 229 })).toBe(true);
    expect(state.run).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(state.menu, { key: 'Enter' })).toBe(false);
    expect(state.run).toHaveBeenCalledTimes(1);
    expect(state.close).toHaveBeenCalledTimes(1);
  } finally {
    state.dom.remove();
  }
});

it('accepts rich-text owner input and ignores commands after access is revoked', () => {
  const state = setup();
  try {
    expect(fireEvent.keyDown(state.dom, { key: 'p' })).toBe(false);
    expect(state.query).toHaveBeenCalledWith('p');
    Object.defineProperty(state.editor, 'isEditable', { value: false });
    expect(fireEvent.keyDown(state.menu, { key: 'Enter' })).toBe(true);
    fireEvent.click(state.menu.querySelector('button')!);
    expect(state.run).not.toHaveBeenCalled();
    expect(state.close).not.toHaveBeenCalled();
  } finally {
    state.dom.remove();
  }
});
