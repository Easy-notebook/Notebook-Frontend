import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { useTipTapSlashCommands } from './useTipTapSlashCommands';

afterEach(cleanup);
function owner() {
  const parent = document.createElement('div');
  const dom = document.createElement('div');
  parent.append(dom);
  const received = vi.fn();
  parent.addEventListener('keydown', received);
  const editor = { view: { dom }, on: vi.fn(), off: vi.fn() } as unknown as Editor;
  const send = (key: string) =>
    dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  return { editor, send, received };
}

it('does not retain keyboard interception after repeated menu open/close cycles', () => {
  const target = owner();
  const hook = renderHook(() => useTipTapSlashCommands({ editor: target.editor }));
  for (let cycle = 0; cycle < 3; cycle++) {
    act(() => hook.result.current.openMenu({ x: 0, y: 0 }));
    act(() => hook.result.current.closeMenu());
    for (const key of ['Enter', 'ArrowUp', 'ArrowDown', 'Escape', 'Tab']) target.send(key);
  }
  expect(target.received).toHaveBeenCalledTimes(15);
});

it('leaves an old editor keyboard usable after replacing the editor', () => {
  const first = owner();
  const second = owner();
  const hook = renderHook(({ editor }) => useTipTapSlashCommands({ editor }), {
    initialProps: { editor: first.editor },
  });
  act(() => hook.result.current.openMenu({ x: 0, y: 0 }));
  hook.rerender({ editor: second.editor });
  first.send('Enter');
  expect(first.received).toHaveBeenCalledOnce();
});

it('does not leave keyboard interception behind on unmount with the menu open', () => {
  const target = owner();
  const hook = renderHook(() => useTipTapSlashCommands({ editor: target.editor }));
  act(() => hook.result.current.openMenu({ x: 0, y: 0 }));
  hook.unmount();
  target.send('Enter');
  expect(target.received).toHaveBeenCalledOnce();
});
