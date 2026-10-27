import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { KeyboardEvent } from 'react';
import { handleSourceInputHistory } from './sourceInputHistory';
import { EditorState } from '@tiptap/pm/state';
import { Schema } from '@tiptap/pm/model';

describe('source input history', () => {
  it('applies caret indentation to the native prefix range without replacing the whole input', () => {
    const input = document.createElement('textarea');
    const original = 'x'.repeat(100000);
    input.value = original;
    input.setSelectionRange(0, 0);
    const replace = vi.spyOn(input, 'setRangeText');
    const updateSource = vi.fn();
    const dispatch = vi.fn();
    const state = EditorState.create({
      schema: new Schema({ nodes: { doc: { content: 'text*' }, text: {} } }),
    });
    const event = {
      key: ']',
      ctrlKey: true,
      nativeEvent: {},
      currentTarget: input,
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    };
    handleSourceInputHistory(
      event as unknown as KeyboardEvent<HTMLTextAreaElement>,
      { isEditable: true, state, view: { dispatch } } as unknown as Editor,
      updateSource
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith('  ', 0, 0, 'preserve');
    expect(input.value).toBe('  ' + original);
    expect(input.selectionStart).toBe(2);
    expect(updateSource).toHaveBeenCalledExactlyOnceWith(input.value);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
  it.each([
    [{ key: 'z', metaKey: true }, 'undo'],
    [{ key: 'z', ctrlKey: true }, 'undo'],
    [{ key: 'Z', metaKey: true, shiftKey: true }, 'redo'],
    [{ key: 'y', ctrlKey: true }, 'redo'],
    [{ key: 'z', ctrlKey: true, altKey: true }, null],
    [{ key: 'z', ctrlKey: true, nativeEvent: { isComposing: true } }, null],
    [{ key: 'z', ctrlKey: true, nativeEvent: { keyCode: 229 } }, null],
    [{ key: 'Enter' }, null],
  ] as const)('routes %j to %s', (keys, expected) => {
    const event = { nativeEvent: {}, stopPropagation: vi.fn(), preventDefault: vi.fn(), ...keys };
    const commands = { undo: vi.fn(), redo: vi.fn() };
    handleSourceInputHistory(
      event as unknown as KeyboardEvent<HTMLTextAreaElement>,
      { isEditable: true, commands } as unknown as Editor
    );
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(commands.undo).toHaveBeenCalledTimes(expected === 'undo' ? 1 : 0);
    expect(commands.redo).toHaveBeenCalledTimes(expected === 'redo' ? 1 : 0);
  });
  it('does not change read-only documents', () => {
    const commands = { undo: vi.fn(), redo: vi.fn() };
    const event = {
      key: 'z',
      ctrlKey: true,
      nativeEvent: {},
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    };
    handleSourceInputHistory(
      event as unknown as KeyboardEvent<HTMLTextAreaElement>,
      { isEditable: false, commands } as unknown as Editor
    );
    expect(commands.undo).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
