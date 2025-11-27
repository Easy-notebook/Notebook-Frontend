// src/hooks/useRouteSync.ts
// Hook to sync route changes with session service

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useRouteStore from '@Store/routeStore';
import useNotebookStore from '@Store/notebookStore';
import usePreviewStore from '@Store/previewStore';
import { NotebookSessionService } from '@Services/session';
import { StoreCleanupService } from '@Services/store';
import { uiLog } from '@Utils/logger';

export const useRouteSync = () => {
  const location = useLocation();
  const { setRoute, currentView, currentNotebookId } = useRouteStore();
  // Keep this to maintain hook order
  useNotebookStore();

  // Track last loaded notebookId to avoid duplicate loads
  const lastLoadedNotebookId = useRef<string | null>(null);
  const sessionService = useRef(NotebookSessionService.getInstance());
  const cleanupService = useRef(StoreCleanupService.getInstance());

  // Track previous path to detect route changes
  const prevPathRef = useRef<string>(location.pathname);

  // Sync route state
  useEffect(() => {
    const currentPath = location.pathname;
    const previousPath = prevPathRef.current;
    prevPathRef.current = currentPath;

    const routeStore = useRouteStore.getState();

    // Only update when route actually changes
    if (routeStore.currentRoute !== currentPath) {
      uiLog.navigation('route_change', {
        from: routeStore.currentRoute,
        to: currentPath,
      });
      setRoute(currentPath);
    }

    // Handle home route: disconnect session, clear stores
    // Only trigger cleanup when ENTERING home route (from a different route)
    // This prevents double-cleanup during initial render or same-route updates
    if (currentPath === '/' && previousPath !== '/') {
      console.log('🔍 [useRouteSync] Navigated to home from', previousPath);
      handleHomeRoute();
    }
  }, [location.pathname, setRoute]);

  // Handle home route navigation
  const handleHomeRoute = async () => {
    const notebookStore = useNotebookStore.getState();

    // Already disconnected and cleared
    if (sessionService.current.isDisconnected() && !notebookStore.notebookId) {
      console.log('🔍 [useRouteSync] Already disconnected, skipping');
      return;
    }

    console.log('🔍 [useRouteSync] Navigating to / - disconnecting session', {
      currentNotebookId: notebookStore.notebookId,
    });

    try {
      // Disconnect session (saves and pauses auto-save)
      await sessionService.current.disconnect();

      // Clean all stores using the cleanup service
      await cleanupService.current.cleanAll();

      console.log('✅ [useRouteSync] Session disconnected, stores cleared');
    } catch (error) {
      console.error('❌ [useRouteSync] Failed to disconnect session', { error });
      uiLog.error('Failed to disconnect session on home route', { error });
    }
  };

  // Handle workspace route loading
  useEffect(() => {
    // Only handle workspace view with notebookId
    if (currentView === 'workspace' && currentNotebookId) {
      // Avoid duplicate loads
      if (lastLoadedNotebookId.current !== currentNotebookId) {
        console.log('🔍 [useRouteSync] Triggering workspace load', {
          currentNotebookId,
          lastLoadedNotebookId: lastLoadedNotebookId.current,
        });
        lastLoadedNotebookId.current = currentNotebookId;
        handleWorkspaceRoute(currentNotebookId);
      } else {
        console.log('🔍 [useRouteSync] Skipping duplicate load', { currentNotebookId });
      }
    } else if (currentView !== 'workspace') {
      // Reset tracking when leaving workspace
      lastLoadedNotebookId.current = null;
    }
  }, [currentView, currentNotebookId]);

  // Handle workspace route
  const handleWorkspaceRoute = async (notebookId: string) => {
    try {
      // Check if notebook is already loaded (e.g., just created)
      const currentNotebookStore = useNotebookStore.getState();
      const alreadyLoaded =
        currentNotebookStore.notebookId === notebookId &&
        currentNotebookStore.isLoaded &&
        currentNotebookStore.isInitialized;

      console.log('🔍 [useRouteSync] handleWorkspaceRoute START', {
        notebookId,
        alreadyLoaded,
        storeNotebookId: currentNotebookStore.notebookId,
        isLoaded: currentNotebookStore.isLoaded,
        isInitialized: currentNotebookStore.isInitialized,
        timestamp: new Date().toISOString(),
      });
      uiLog.navigation('workspace', { notebookId, alreadyLoaded });

      if (alreadyLoaded) {
        console.log('🔍 [useRouteSync] Notebook already loaded, skipping session connect', {
          notebookId,
        });
        // Just switch preview store
        const previewStore = usePreviewStore.getState();
        await previewStore.switchToNotebook(notebookId);
      } else {
        console.log('🔍 [useRouteSync] Loading notebook via session connect', { notebookId });
        // Connect session (loads notebook, resumes auto-save)
        await sessionService.current.connect(notebookId);

        // Switch preview store to this notebook
        const previewStore = usePreviewStore.getState();
        await previewStore.switchToNotebook(notebookId);
      }

      uiLog.info('Workspace loaded for notebook', { notebookId });
      console.log('🔍 [useRouteSync] handleWorkspaceRoute END', { notebookId });
    } catch (error) {
      console.error('❌ [useRouteSync] Failed to load workspace', { notebookId, error });
      uiLog.error('Failed to load workspace', { notebookId, error });
    }
  };

  return {
    currentView,
    currentNotebookId,
    currentRoute: location.pathname,
  };
};
