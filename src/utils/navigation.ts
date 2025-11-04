// src/utils/navigation.ts
// Navigation utilities for the application

import useRouteStore from '../store/routeStore';

/**
 * Navigate to the home page (EmptyState)
 */
export const navigateToHome = (): void => {
  const { navigateToEmpty } = useRouteStore.getState();
  navigateToEmpty();
};

/**
 * Navigate to the library page
 */
export const navigateToLibrary = (): void => {
  const { navigateToLibrary: navToLibrary } = useRouteStore.getState();
  navToLibrary();
};

/**
 * Navigate to a specific workspace
 * @param notebookId - The ID of the notebook to open
 */
export const navigateToWorkspace = (notebookId: string): void => {
  const { navigateToWorkspace: navToWorkspace } = useRouteStore.getState();
  navToWorkspace(notebookId);
};

/**
 * Get the current route information
 */
export const getCurrentRoute = () => {
  const path = window.location.pathname;
  
  if (path === '/') {
    return { type: 'home' } as const;
  }
  
  if (path === '/FoKn/Library') {
    return { type: 'library' } as const;
  }
  
  if (path.startsWith('/workspace/')) {
    const notebookId = path.split('/workspace/')[1];
    return { type: 'workspace', notebookId } as const;
  }
  
  return { type: 'unknown', path } as const;
};

/**
 * Check if the current route is the home page
 */
export const isHomeRoute = (): boolean => {
  return window.location.pathname === '/';
};

/**
 * Check if the current route is the library
 */
export const isLibraryRoute = (): boolean => {
  return window.location.pathname === '/FoKn/Library';
};

/**
 * Check if the current route is a workspace
 */
export const isWorkspaceRoute = (): boolean => {
  return window.location.pathname.startsWith('/workspace/');
};

/**
 * Get the notebook ID from the current workspace route
 */
export const getCurrentNotebookId = (): string | null => {
  const route = getCurrentRoute();
  if (route.type === 'workspace') {
    return route.notebookId;
  }
  return null;
};

/**
 * Generate workspace URL for a notebook
 */
export const getWorkspaceUrl = (notebookId: string): string => {
  return `/workspace/${notebookId}`;
};

/**
 * Generate home URL
 */
export const getHomeUrl = (): string => {
  return '/';
};

/**
 * Generate library URL
 */
export const getLibraryUrl = (): string => {
  return '/FoKn/Library';
};