import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
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
  cleanup();
  vi.clearAllMocks();
});
it('defers offscreen creation, activates near the viewport and never evicts active state', () => {
  render(<Probe />);
  expect(screen.getByText('deferred')).toBeDefined();
  act(() => observation.notify(true));
  expect(screen.getByText('active')).toBeDefined();
  expect(observation.release).toHaveBeenCalledOnce();
  act(() => observation.notify(false));
  expect(screen.getByText('active')).toBeDefined();
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
    dom: { isConnected: true },
    state: { doc: { length: 42 } },
    dispatch: vi.fn(),
    focus: vi.fn(),
  };
  await act(async () => latest.onCreateEditor(view as any));
  expect(view.dispatch).toHaveBeenCalledWith({ selection: { anchor: 42 }, scrollIntoView: true });
  expect(view.focus).toHaveBeenCalledOnce();
});
it('immediately mounts selected/detached editors and retains them after deselection', () => {
  const rendered = render(<Probe immediate />);
  expect(screen.getByText('active')).toBeDefined();
  rendered.rerender(<Probe immediate={false} />);
  expect(screen.getByText('active')).toBeDefined();
});
