// src/hooks/useRouteSync.ts
// Hook to sync route changes with route store

import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useRouteStore from '@Store/routeStore';
import useNotebookStore from '@Store/notebookStore';
import usePreviewStore from '@Store/previewStore';
import { uiLog } from '@Utils/logger';

export const useRouteSync = () => {
  const location = useLocation();
  const { setRoute, currentView, currentNotebookId } = useRouteStore();
  // Keep this to maintain hook order, even though we don't use loadFromDatabase anymore
  useNotebookStore();
  const { switchToNotebook } = usePreviewStore();

  // 追踪最后加载的 notebookId,避免重复加载
  const lastLoadedNotebookId = useRef<string | null>(null);

  // 处理 workspace 路由的 notebook 加载
  const handleWorkspaceRoute = useCallback(
    async (view: string, notebookId: string | null) => {
      if (view === 'workspace' && notebookId) {
        try {
          console.log('🔍 [useRouteSync] handleWorkspaceRoute START', {
            view,
            notebookId,
            timestamp: new Date().toISOString(),
          });
          uiLog.navigation('workspace', { notebookId });

          // ✅ FIX: Only call switchToNotebook once, which will load from database internally
          // This prevents duplicate loading and potential data overwrites
          console.log('🔍 [useRouteSync] Calling switchToNotebook (single load)', {
            notebookId,
          });
          await switchToNotebook(notebookId);
          console.log('🔍 [useRouteSync] switchToNotebook completed', { notebookId });

          uiLog.info('Workspace loaded for notebook', { notebookId });
          console.log('🔍 [useRouteSync] handleWorkspaceRoute END', { notebookId });
        } catch (error) {
          console.error('❌ [useRouteSync] Failed to load workspace', { notebookId, error });
          uiLog.error('Failed to load workspace', { notebookId, error });
        }
      }
    },
    [switchToNotebook]
  );

  // 同步路由状态
  useEffect(() => {
    const currentPath = location.pathname;
    const routeStore = useRouteStore.getState();

    // 只有当路由真正改变时才更新，避免初始化时不必要的重复设置
    if (routeStore.currentRoute !== currentPath) {
      uiLog.navigation('route_change', {
        from: routeStore.currentRoute,
        to: currentPath,
      });
      setRoute(currentPath);
    }

    // 当路由切换到主页时，重置预览模式为notebook并清除activeFile
    if (currentPath === '/') {
      const previewStore = usePreviewStore.getState();
      if (previewStore.previewMode === 'file' || previewStore.activeFile) {
        uiLog.debug('Resetting preview state for home route');
        previewStore.resetToNotebookMode();
      }
    }
  }, [location.pathname, setRoute]);

  // 处理 workspace 路由的加载 - 统一的 useEffect
  useEffect(() => {
    // 只在 workspace 视图且有 notebookId 时处理
    if (currentView === 'workspace' && currentNotebookId) {
      // 避免重复加载同一个 notebook
      if (lastLoadedNotebookId.current !== currentNotebookId) {
        console.log('🔍 [useRouteSync] Triggering workspace load for new notebook', {
          currentNotebookId,
          lastLoadedNotebookId: lastLoadedNotebookId.current,
        });
        lastLoadedNotebookId.current = currentNotebookId;
        handleWorkspaceRoute(currentView, currentNotebookId);
      } else {
        console.log('🔍 [useRouteSync] Skipping duplicate load for same notebook', {
          currentNotebookId,
        });
      }
    } else if (currentView !== 'workspace') {
      // 当离开 workspace 时,重置追踪状态
      lastLoadedNotebookId.current = null;
    }
  }, [currentView, currentNotebookId, handleWorkspaceRoute]);

  // 在首页刷新时，若有持久化的当前notebookId，则自动恢复到工作区
  useEffect(() => {
    try {
      if (location.pathname === '/') {
        const persistedId = usePreviewStore.getState().currentNotebookId;
        if (persistedId) {
          const routeState = useRouteStore.getState();
          // 仅当路由未指向该notebook时才导航，避免循环
          if (
            routeState.currentNotebookId !== persistedId ||
            routeState.currentView !== 'workspace'
          ) {
            uiLog.info('Auto-restoring last notebook after refresh', { notebookId: persistedId });
            routeState.navigateToWorkspace(persistedId);
          }
        }
      }
    } catch (error) {
      uiLog.warn('Auto-restore on refresh failed', { error });
    }
  }, [location.pathname]);

  return {
    currentView,
    currentNotebookId,
    currentRoute: location.pathname,
  };
};
