import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const route = {
    currentRoute: '/workspace/a', currentView: 'workspace', currentNotebookId: 'a',
    setRoute: vi.fn(),
  };
  return {
    location: { pathname: '/workspace/a' }, route,
    notebook: { notebookId: 'a' },
    session: {
      isDisconnected: () => false,
      getCurrentNotebookId: () => 'a',
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      switchSession: vi.fn(async () => {}),
    },
    clean: vi.fn(async () => {}),
    preview: vi.fn(async () => {}),
  };
});
vi.mock('react-router-dom', () => ({ useLocation: () => fixture.location }));
vi.mock('@Store/routeStore', () => ({
  default: Object.assign((select: (state: typeof fixture.route) => unknown) => select(fixture.route), {
    getState: () => fixture.route,
  }),
}));
vi.mock('@Store/notebookStore', () => ({ default: { getState: () => fixture.notebook } }));
vi.mock('@Store/previewStore', () => ({ default: { getState: () => ({ switchToNotebook: fixture.preview }) } }));
vi.mock('@Services/session', () => ({ NotebookSessionService: { getInstance: () => fixture.session } }));
vi.mock('@Services/store', () => ({ StoreCleanupService: { getInstance: () => ({ cleanAll: fixture.clean }) } }));
vi.mock('@Utils/logger', () => ({ uiLog: { error: vi.fn() } }));

import { useRouteSync } from './useRouteSync';

it('does not expose the old workspace as ready while home cleanup is still in flight', async () => {
  const { result, rerender } = renderHook(() => useRouteSync());
  expect(result.current.isRouteReady).toBe(false);
  await waitFor(() => expect(result.current.isRouteReady).toBe(true));

  let release!: () => void;
  fixture.clean.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  fixture.location = { pathname: '/' };
  rerender();
  await waitFor(() => expect(fixture.clean).toHaveBeenCalledTimes(1));
  fixture.location = { pathname: '/workspace/a' };
  rerender();
  expect(result.current.isRouteReady).toBe(false);
  expect(fixture.session.connect).toHaveBeenCalledTimes(1);

  await act(async () => { release(); });
  await waitFor(() => expect(result.current.isRouteReady).toBe(true));
  expect(fixture.session.connect).toHaveBeenCalledTimes(2);
  expect(fixture.preview).toHaveBeenCalledTimes(2);

  fixture.session.disconnect.mockRejectedValueOnce(new Error('Cannot save'));
  fixture.location = { pathname: '/' };
  rerender();
  await waitFor(() => expect(result.current.routeError).toContain('Cannot save'));
  expect(result.current.isRouteReady).toBe(false);
  expect(fixture.clean).toHaveBeenCalledTimes(1);
  await act(async () => { result.current.retryRoute(); });
  await waitFor(() => expect(result.current.isRouteReady).toBe(true));
  expect(result.current.routeError).toBeNull();
  expect(fixture.clean).toHaveBeenCalledTimes(2);
});
