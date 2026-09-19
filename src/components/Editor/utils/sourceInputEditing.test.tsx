import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { handleSourceInputHistory } from './sourceInputHistory';

it('publishes indentation and selection synchronously across consecutive controlled-input commands', () => {
  const publish = vi.fn();
  const editor = {
    isEditable: true,
    state: { tr: { setMeta: vi.fn().mockReturnThis() } },
    view: { dispatch: vi.fn() },
  } as unknown as Editor;
  function Source() {
    const [value, setValue] = useState('a\nb');
    return (
      <textarea
        aria-label="Source"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) =>
          handleSourceInputHistory(event, editor, (source) => {
            publish(source);
            setValue(source);
          })
        }
      />
    );
  }
  render(<Source />);
  const input = screen.getByRole('textbox', { name: 'Source' }) as HTMLTextAreaElement;
  input.focus();
  input.setSelectionRange(0, 3, 'backward');
  fireEvent.keyDown(input, { key: ']', ctrlKey: true });
  expect(input.value).toBe('  a\n  b');
  expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
    2,
    7,
    'backward',
  ]);
  fireEvent.keyDown(input, { key: '[', ctrlKey: true });
  expect(input.value).toBe('a\nb');
  expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
    0,
    3,
    'backward',
  ]);
  expect(publish.mock.calls).toEqual([['  a\n  b'], ['a\nb']]);
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(publish).toHaveBeenCalledTimes(2);
});
