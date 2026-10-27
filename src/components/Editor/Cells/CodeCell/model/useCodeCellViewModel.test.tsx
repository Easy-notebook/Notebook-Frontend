import { useLayoutEffect, useRef } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useCodeCellViewModel } from './useCodeCellViewModel';
import type { CodeCellViewModel } from './CodeCellViewModel';
import type { ReactCodeMirrorRef } from '../utils/types';

it('releases a scheduled collapse scroll when its view unmounts', () => {
  vi.useFakeTimers();
  const element = document.createElement('div');
  element.scrollIntoView = vi.fn();
  document.body.append(element);
  const cell = { id: 'unmount-scroll', type: 'code' as const, content: '' };
  const editor = { current: null };
  const wrapper = { current: element };
  const view = renderHook(() =>
    useCodeCellViewModel(cell, false, false, false, editor, wrapper, wrapper)
  );
  try {
    const before = vi.getTimerCount();
    act(() => view.result.current.handleCollapse());
    expect(vi.getTimerCount()).toBe(before + 1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(before);
    vi.advanceTimersByTime(100);
    expect(element.scrollIntoView).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    element.remove();
    vi.useRealTimers();
  }
});

it('observes an initial child layout measurement made before passive subscription', () => {
  const cell = { id: 'initial-measurement', type: 'code' as const, content: '' };
  function Measurement({ vm }: { vm: CodeCellViewModel }) {
    useLayoutEffect(() => {
      vm.setContentHeight(900);
    }, [vm]);
    return null;
  }
  function View() {
    const editor = useRef<ReactCodeMirrorRef>(null);
    const wrapper = useRef<HTMLDivElement>(null);
    const container = useRef<HTMLDivElement>(null);
    const vm = useCodeCellViewModel(cell, false, false, false, editor, wrapper, container);
    return (
      <>
        <Measurement vm={vm} />
        <output>{vm.contentHeight}</output>
      </>
    );
  }
  render(<View />);
  expect(screen.getByRole('status').textContent).toBe('900');
});
