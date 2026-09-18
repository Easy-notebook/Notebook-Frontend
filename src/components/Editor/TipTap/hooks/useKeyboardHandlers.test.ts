import { expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardHandlers } from './useKeyboardHandlers';

it.each(['Tab', 'Backspace', 'ArrowUp', 'Home', 'End'])(
  'leaves %s to the IME during composition',
  (key) => {
    const { result } = renderHook(() => useKeyboardHandlers());
    const { handleKeyDown } = result.current;
    for (const [composing, native] of [
      [true, {}],
      [false, { isComposing: true }],
      [false, { keyCode: 229 }],
    ] as const) {
      const event = { key, ctrlKey: true, ...native, preventDefault: vi.fn() };
      expect(handleKeyDown({ composing } as any, event as any)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  }
);
