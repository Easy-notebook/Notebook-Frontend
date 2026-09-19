import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import useRouteStore from '@Store/routeStore';
import useNotebookStore from '@Store/notebookStore';
import usePreviewStore from '@Store/previewStore';
import { NotebookSessionService } from '@Services/session';
import { RouteTransitionCoordinator } from '@Services/session/RouteTransitionCoordinator';
import { StoreCleanupService } from '@Services/store';
import { uiLog } from '@Utils/logger';

// App-lifetime ownership: unmounting a route cannot abandon an in-flight cleanup.
const transitions = new RouteTransitionCoordinator(async path => {
  const session = NotebookSessionService.getInstance();
  if (path === '/') {
    if (session.isDisconnected() && !useNotebookStore.getState().notebookId) return;
    await session.disconnect();
    await StoreCleanupService.getInstance().cleanAll();
  } else if (path.startsWith('/workspace/')) {
    const notebookId = path.slice('/workspace/'.length);
    const previousId = session.getCurrentNotebookId();
    if (previousId && previousId !== notebookId) {
      await session.switchSession(notebookId);
    } else {
      // connect owns both the already-loaded check and auto-save activation.
      await session.connect(notebookId);
    }
    await usePreviewStore.getState().switchToNotebook(notebookId);
  }
}, (path, error) => uiLog.error('Failed to synchronize route', { path, error }));

export const useRouteSync = () => {
  const location = useLocation();
  const currentView = useRouteStore(state => state.currentView);
  const currentNotebookId = useRouteStore(state => state.currentNotebookId);
  const transition = useSyncExternalStore(transitions.subscribe, transitions.getSnapshot);

  useEffect(() => {
    const route = useRouteStore.getState();
    if (route.currentRoute !== location.pathname) route.setRoute(location.pathname);
    void transitions.request(location.pathname);
  }, [location.pathname]);

  return {
    currentView,
    currentNotebookId,
    currentRoute: location.pathname,
    isRouteReady: transition.status === 'ready' && transition.path === location.pathname,
    routeError: transition.status === 'error' && transition.path === location.pathname
      ? String(transition.error) : null,
    retryRoute: () => { void transitions.request(location.pathname); },
  };
};
