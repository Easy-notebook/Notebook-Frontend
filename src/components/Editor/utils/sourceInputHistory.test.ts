import { describe, expect, it, vi } from 'vitest';
import { UNDO_COMMAND, REDO_COMMAND, type LexicalEditor } from 'lexical';
import type { KeyboardEvent } from 'react';
import { handleSourceInputHistory } from '../Lexical/interaction/sourceInput';

describe('source input history', () => {
  it('applies caret indentation to the native prefix range without replacing the whole input', () => {
    const input = document.createElement('textarea');
    const original = 'x'.repeat(100000);
    input.value = original;
    input.setSelectionRange(0, 0);
    const replace = vi.spyOn(input, 'setRangeText');
    const updateSource = vi.fn();
    const update = vi.fn((callback: () => void) => callback());
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
      { isEditable: () => true, update } as unknown as LexicalEditor,
      updateSource
    );
    expect(replace).toHaveBeenCalledExactlyOnceWith('  ', 0, 0, 'preserve');
    expect(input.value).toBe('  ' + original);
    expect(input.selectionStart).toBe(2);
    expect(updateSource).toHaveBeenCalledExactlyOnceWith(input.value);
    expect(update).toHaveBeenCalledOnce();
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
    const dispatchCommand = vi.fn();
    handleSourceInputHistory(
      event as unknown as KeyboardEvent<HTMLTextAreaElement>,
      { isEditable: () => true, dispatchCommand } as unknown as LexicalEditor
    );
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(dispatchCommand).toHaveBeenCalledTimes(expected ? 1 : 0);
    if (expected)
      expect(dispatchCommand).toHaveBeenCalledWith(
        expected === 'undo' ? UNDO_COMMAND : REDO_COMMAND,
        undefined
      );
  });
  it('does not change read-only documents', () => {
    const dispatchCommand = vi.fn();
    const event = {
      key: 'z',
      ctrlKey: true,
      nativeEvent: {},
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    };
    handleSourceInputHistory(
      event as unknown as KeyboardEvent<HTMLTextAreaElement>,
      { isEditable: () => false, dispatchCommand } as unknown as LexicalEditor
    );
    expect(dispatchCommand).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
