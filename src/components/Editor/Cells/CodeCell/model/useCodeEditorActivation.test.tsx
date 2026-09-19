import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
const observation = vi.hoisted(() => ({ notify: (_visible: boolean) => {}, release: vi.fn() }));
vi.mock('../../../utils/previewVisibility', () => ({
  observePreview: (_node: Element, listener: (visible: boolean) => void) => {
    observation.notify = listener;
    return observation.release;
  },
}));
import { useCodeEditorActivation } from './useCodeEditorActivation';
let latest: ReturnType<typeof useCodeEditorActivation>;
function Probe({ immediate = false }) {
  latest = useCodeEditorActivation('target', immediate);
  return <div ref={latest.container}>{latest.active ? 'active' : 'deferred'}</div>;
}
afterEach(() => {
  document.getSelection()?.removeAllRanges();
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});
it.each([false, true])('pins external DOM selection and resumes eviction after clearing (already pending: %s)', (pending) => {
  vi.useFakeTimers();
  render(<Probe />);
  act(() => observation.notify(true));
  act(() => latest.onCreateEditor(suspendedView() as any));
  if (pending) {
    act(() => observation.notify(false));
    act(() => vi.advanceTimersByTime(250));
  }
  const range = document.createRange();
  // Both endpoints are outside the editor container.
  range.selectNode(latest.container.current!);
  document.getSelection()!.addRange(range);
  act(() => document.dispatchEvent(new Event('selectionchange')));
  act(() => observation.notify(false));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('active')).toBeDefined();
  act(() => {
    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
  });
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByText('deferred')).toBeDefined();
});
const suspendedView = () => ({
  state: EditorState.create({ doc: 'print(1)' }),
  dom: {
    isConnected: true,
    getBoundingClientRect: () => ({ height: 120 }),
    scrollIntoView: vi.fn(),
  },
  scrollDOM: { scrollTop: 0, scrollLeft: 0 },
  hasFocus: false,
  composing: false,
  requestMeasure: vi.fn(),
  dispatch: vi.fn(),
  focus: vi.fn(),
});
it('defers creation, suspends offscreen views and restores their initial state', () => {
  vi.useFakeTimers();
  render(<Probe />);
  expect(screen.getByText('deferred')).toBeDefined();
  act(() => observation.notify(true));
  expect(screen.getByText('active')).toBeDefined();
  act(() => latest.onCreateEditor(suspendedView() as any));
  expect(observation.release).not.toHaveBeenCalled();
  act(() => observation.notify(false));
  act(() => vi.advanceTimersByTime(499));
  expect(screen.getByText('active')).toBeDefined();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText('deferred')).toBeDefined();
  expect(latest.placeholderHeight).toBe(120);
  expect(latest.initialState('print(1)')?.json.doc).toBe('print(1)');
  act(() => observation.notify(true));
  expect(screen.getByText('active')).toBeDefined();
});
it('pins focus and IME, then reclaims after blur or composition settlement', async () => {
  vi.useFakeTimers();
  render(<Probe />);
  act(() => observation.notify(true));
  const view = suspendedView();
  view.hasFocus = true;
  act(() => latest.onCreateEditor(view as any));
  act(() => observation.notify(false));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('active')).toBeDefined();
  view.hasFocus = false;
  view.composing = true;
  act(() => latest.onUpdate({} as any));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('active')).toBeDefined();
  view.composing = false;
  await act(async () => {
    latest.onInputSettled();
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(screen.getByText('deferred')).toBeDefined();
});
it('cancels pending suspension on visibility and releases observation on unmount', () => {
  vi.useFakeTimers();
  const rendered = render(<Probe />);
  act(() => observation.notify(true));
  act(() => latest.onCreateEditor(suspendedView() as any));
  act(() => observation.notify(false));
  act(() => vi.advanceTimersByTime(250));
  act(() => observation.notify(true));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('active')).toBeDefined();
  rendered.unmount();
  expect(observation.release).toHaveBeenCalledOnce();
});
it('activates a navigation target and restores direction-dependent focus after creation', async () => {
  render(<Probe />);
  act(() =>
    window.dispatchEvent(
      new CustomEvent('cell-navigation', { detail: { targetCellId: 'other', direction: 'up' } })
    )
  );
  expect(screen.getByText('deferred')).toBeDefined();
  act(() =>
    window.dispatchEvent(
      new CustomEvent('cell-navigation', { detail: { targetCellId: 'target', direction: 'up' } })
    )
  );
  const view = {
    dom: { isConnected: true, scrollIntoView: vi.fn() },
    state: { doc: { length: 42 } },
    dispatch: vi.fn(),
    focus: vi.fn(),
  };
  await act(async () => latest.onCreateEditor(view as any));
  expect(view.dispatch).toHaveBeenCalledWith({ selection: { anchor: 42 }, scrollIntoView: true });
  expect(view.focus).toHaveBeenCalledOnce();
  expect(view.dom.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
});
it('pins selected/detached editors and can reclaim them after deselection', () => {
  vi.useFakeTimers();
  const rendered = render(<Probe immediate />);
  expect(screen.getByText('active')).toBeDefined();
  act(() => latest.onCreateEditor(suspendedView() as any));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('active')).toBeDefined();
  rendered.rerender(<Probe immediate={false} />);
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByText('deferred')).toBeDefined();
});

it('keeps the latest direction during activation and continues routing after creation', async () => {
  render(<Probe />);
  const navigate = (direction: string) =>
    window.dispatchEvent(
      new CustomEvent('cell-navigation', { detail: { targetCellId: 'target', direction } })
    );
  act(() => navigate('up'));
  act(() => navigate('down'));
  const view = {
    dom: { isConnected: true, scrollIntoView: vi.fn() },
    state: { doc: { length: 42 } },
    dispatch: vi.fn(),
    focus: vi.fn(),
  };
  await act(async () => latest.onCreateEditor(view as any));
  expect(view.dispatch).toHaveBeenCalledTimes(1);
  expect(view.dispatch).toHaveBeenLastCalledWith({
    selection: { anchor: 0 },
    scrollIntoView: true,
  });
  await act(async () => {
    navigate('up');
  });
  expect(view.dispatch).toHaveBeenCalledTimes(2);
  expect(view.dispatch).toHaveBeenLastCalledWith({
    selection: { anchor: 42 },
    scrollIntoView: true,
  });
});

it('cancels queued focus when the cell unmounts', async () => {
  const rendered = render(<Probe />);
  const view = {
    dom: { isConnected: true, scrollIntoView: vi.fn() },
    state: { doc: { length: 42 } },
    dispatch: vi.fn(),
    focus: vi.fn(),
  };
  act(() => {
    latest.activate();
    latest.onCreateEditor(view as any);
    rendered.unmount();
  });
  await act(async () => {});
  expect(view.focus).not.toHaveBeenCalled();
});
it('focuses an editor already created by visibility before an activation event arrives', async () => {
  render(<Probe />);
  act(() => observation.notify(true));
  const view = suspendedView();
  act(() => latest.onCreateEditor(view as any));
  expect(view.focus).not.toHaveBeenCalled();
  await act(async () => latest.activate());
  expect(view.focus).toHaveBeenCalledOnce();
  expect(view.dispatch).toHaveBeenCalledWith({ selection: { anchor: 0 }, scrollIntoView: true });
});
it('transfers placeholder focus once when activation precedes editor creation', async () => {
  render(<Probe />);
  await act(async () => latest.activate());
  const view = suspendedView();
  await act(async () => latest.onCreateEditor(view as any));
  expect(view.focus).toHaveBeenCalledOnce();
  expect(view.dispatch).toHaveBeenCalledTimes(1);
});
