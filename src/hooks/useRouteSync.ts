// src/hooks/useRouteSync.ts
// Hook to sync route changes with route store

import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import useRouteStore from '../store/routeStore';
import useNotebookStore from '../store/notebookStore';
import usePreviewStore from '../store/previewStore';
import { uiLog, storeLog } from '../utils/logger';

export const useRouteSync = () => {
  const location = useLocation();
  const { setRoute, currentView, currentNotebookId } = useRouteStore();
  const { setNotebookId, loadFromDatabase } = useNotebookStore();
  const { switchToNotebook } = usePreviewStore();
  
  // 处理 workspace 路由的 notebook 加载
  const handleWorkspaceRoute = useCallback(async (view: string, notebookId: string | null) => {
    if (view === 'workspace' && notebookId) {
      try {
        uiLog.navigation('workspace', { notebookId });
        
        // 设置当前 notebook ID
        setNotebookId(notebookId);
        
        // 从数据库加载 notebook 数据
        const loadSuccess = await loadFromDatabase(notebookId);
        if (!loadSuccess) {
          storeLog.warn('Could not load notebook from database', { notebookId });
        }
        
        // 切换预览 store
        await switchToNotebook(notebookId);
        
        uiLog.info('Workspace loaded for notebook', { notebookId });
      } catch (error) {
        uiLog.error('Failed to load workspace', { notebookId, error });
      }
    }
  }, [setNotebookId, loadFromDatabase, switchToNotebook]);

  // 同步路由状态
  useEffect(() => {
    const currentPath = location.pathname;
    const routeStore = useRouteStore.getState();
    
    // 只有当路由真正改变时才更新，避免初始化时不必要的重复设置
    if (routeStore.currentRoute !== currentPath) {
      uiLog.navigation('route_change', {
        from: routeStore.currentRoute,
        to: currentPath
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

  // 初始化时立即处理当前路由（如果是 workspace）
  useEffect(() => {
    // 确保使用最新的路由状态，而不是hook参数中的状态
    const routeState = useRouteStore.getState();
    
    // 只在初始化时执行一次，避免重复调用
    if (routeState.currentView === 'workspace' && routeState.currentNotebookId) {
      handleWorkspaceRoute(routeState.currentView, routeState.currentNotebookId);
    }
  }, []); // 只在组件挂载时运行一次
  
  // 监听路由变化时处理 workspace 加载（避免初始化重复）
  useEffect(() => {
    // 添加防重复逻辑
    const routeState = useRouteStore.getState();
    if (currentView === 'workspace' && currentNotebookId && 
        (routeState.currentView !== currentView || routeState.currentNotebookId !== currentNotebookId)) {
      handleWorkspaceRoute(currentView, currentNotebookId);
    }
  }, [currentView, currentNotebookId, handleWorkspaceRoute]);

  return {
    currentView,
    currentNotebookId,
    currentRoute: location.pathname
  };
};