import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LaTeXView } from './LaTeXView';

const fsm = vi.hoisted(() => ({ getCurrentState: () => 'editing', send: vi.fn() }));
vi.mock('../../core/BaseNodeView', () => ({
  BaseNodeView: ({ renderState }: any) => renderState('editing', {}, fsm),
}));
vi.mock('../../../model/useMathPreview', () => ({
  useMathPreview: () => ({ html: '', error: '', retry: vi.fn(), reloadRequired: false }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it('focuses the committed formula input without retaining a deferred focus task', () => {
  vi.useFakeTimers();
  // jsdom focus schedules its own select event; isolate application-owned work.
  const focus = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => {});
  const timers = vi.getTimerCount();
  const view = render(
    <LaTeXView node={{ attrs: { latex: 'x', displayMode: false } }} updateAttributes={vi.fn()} />
  );
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus.mock.contexts[0]).toBe(screen.getByRole('textbox'));
  expect(vi.getTimerCount()).toBe(timers);
  view.unmount();
  expect(vi.getTimerCount()).toBe(timers);
});

it.each([
  { key: 'Enter', isComposing: true },
  { key: 'Escape', isComposing: true },
  { key: 'Enter', keyCode: 229 },
  { key: 'Escape', keyCode: 229 },
])('keeps formula editing open during input-method key events: %o', (init) => {
  const updateAttributes = vi.fn();
  render(
    <LaTeXView
      node={{ attrs: { latex: 'x', displayMode: false } }}
      updateAttributes={updateAttributes}
    />
  );
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '中文' } });
  const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
  fireEvent(input, event);
  expect(event.defaultPrevented).toBe(false);
  expect(updateAttributes).not.toHaveBeenCalled();
  expect(fsm.send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(updateAttributes).not.toHaveBeenCalled();
  expect(fsm.send).toHaveBeenCalledExactlyOnceWith('SAVE', { latex: '中文' });
});

it('still cancels normally outside composition', () => {
  const updateAttributes = vi.fn();
  render(
    <LaTeXView
      node={{ attrs: { latex: 'x', displayMode: false } }}
      updateAttributes={updateAttributes}
    />
  );
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(fsm.send).toHaveBeenCalledExactlyOnceWith('CANCEL');
  expect(updateAttributes).not.toHaveBeenCalled();
});
