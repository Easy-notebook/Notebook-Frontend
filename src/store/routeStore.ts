// src/store/routeStore.ts
// Route state management for NotebookApp

import { create } from 'zustand';
import { storeLog, uiLog } from '../utils/logger';

export type AppView = 'empty' | 'library' | 'workspace' | 'agent' | 'file-preview';

export interface RouteState {
  currentView: AppView;
  currentNotebookId: string | null;
  currentRoute: string;
  
  // Actions
  setView: (view: AppView) => void;
  setNotebookId: (id: string | null) => void;
  setRoute: (route: string) => void;
  
  // Route helpers
  navigateToEmpty: () => void;
  navigateToLibrary: () => void;
  navigateToWorkspace: (notebookId: string) => void;
}

// 获取初始路由状态，避免总是从 empty 开始
const getInitialRouteState = () => {
  const currentPath = window.location.pathname;
  storeLog.debug('RouteStore: Initializing with path', { currentPath });
  
  if (currentPath === '/') {
    storeLog.debug('RouteStore: Setting initial state to EMPTY');
    return {
      currentView: 'empty' as AppView,
      currentNotebookId: null,
      currentRoute: '/'
    };
  } else if (currentPath === '/FoKn/Library') {
    storeLog.debug('RouteStore: Setting initial state to LIBRARY');
    return {
      currentView: 'library' as AppView,
      currentNotebookId: null,
      currentRoute: '/FoKn/Library'
    };
  } else if (currentPath.startsWith('/workspace/')) {
    const notebookId = currentPath.split('/workspace/')[1];
    storeLog.debug('RouteStore: Setting initial state to WORKSPACE', { notebookId });
    return {
      currentView: 'workspace' as AppView,
      currentNotebookId: notebookId,
      currentRoute: currentPath
    };
  } else {
    storeLog.warn('RouteStore: Unknown path, defaulting to EMPTY', { currentPath });
    // 默认情况
    return {
      currentView: 'empty' as AppView,
      currentNotebookId: null,
      currentRoute: currentPath
    };
  }
};

const initialState = getInitialRouteState();
storeLog.debug('RouteStore: Final initial state', initialState);

const useRouteStore = create<RouteState>((set, get) => ({
  currentView: initialState.currentView,
  currentNotebookId: initialState.currentNotebookId,
  currentRoute: initialState.currentRoute,
  
  setView: (view: AppView) => set({ currentView: view }),
  setNotebookId: (id: string | null) => set({ currentNotebookId: id }),
  setRoute: (route: string) => {
    const state = get();
    set({ currentRoute: route });
    
    // Auto-detect view based on route
    if (route === '/') {
      set({ currentView: 'empty' });
    } else if (route === '/FoKn/Library') {
      set({ currentView: 'library' });
    } else if (route.startsWith('/workspace/')) {
      const notebookId = route.split('/workspace/')[1];
      set({ 
        currentView: 'workspace',
        currentNotebookId: notebookId
      });
    }
  },
  
  navigateToEmpty: () => {
    window.history.pushState(null, '', '/');
    get().setRoute('/');
  },
  
  navigateToLibrary: () => {
    window.history.pushState(null, '', '/FoKn/Library');
    get().setRoute('/FoKn/Library');
  },
  
  navigateToWorkspace: (notebookId: string) => {
    const route = `/workspace/${notebookId}`;
    window.history.pushState(null, '', route);
    get().setRoute(route);
  },
}));

export default useRouteStore;