/**
 * @fileoverview Session Store - Zustand store for session state management
 * Connects NotebookSessionService events to reactive UI state
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { NotebookSessionService } from './NotebookSessionService';
import {
  SessionStatus,
  type SessionState,
  type ISessionService,
  type NotebookSession,
} from './types';

/**
 * Session store actions interface
 */
export interface SessionStoreActions {
  /** Initialize the session service */
  initialize: () => Promise<void>;

  /** Connect to a notebook session */
  connect: (notebookId: string) => Promise<NotebookSession | null>;

  /** Disconnect from current session */
  disconnect: () => Promise<void>;

  /** Switch to a different notebook */
  switchSession: (notebookId: string) => Promise<NotebookSession | null>;

  /** Check if connected */
  isConnected: () => boolean;

  /** Check if disconnected */
  isDisconnected: () => boolean;

  /** Clear error */
  clearError: () => void;
}

/**
 * Full session store type
 */
export type SessionStore = SessionState & SessionStoreActions;

/**
 * Create the session store with service integration
 */
export function createSessionStore(service: ISessionService) {
  const store = create<SessionStore>()(
    subscribeWithSelector((_set, get) => ({
      ...service.getState(),
      initialize: () => service.initialize(),
      connect: (notebookId: string) => service.connect(notebookId),
      disconnect: () => service.disconnect(),
      switchSession: (notebookId: string) => service.switchSession(notebookId),
      isConnected: () => get().status === SessionStatus.CONNECTED,
      isDisconnected: () => get().status === SessionStatus.DISCONNECTED,
      clearError: () => service.clearError(),
    }))
  );
  const unsubscribe = service.subscribe((event) => store.setState(event.state));
  return { store, unsubscribe };
}

const binding = createSessionStore(NotebookSessionService.getInstance());
const useSessionStore = binding.store;
const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(binding.unsubscribe);

// ==================== Selectors ====================

export const selectSessionStatus = (state: SessionStore) => state.status;
export const selectCurrentNotebookId = (state: SessionStore) => state.currentNotebookId;
export const selectIsConnected = (state: SessionStore) => state.status === SessionStatus.CONNECTED;
export const selectIsDisconnected = (state: SessionStore) =>
  state.status === SessionStatus.DISCONNECTED;
export const selectIsLoading = (state: SessionStore) => state.status === SessionStatus.LOADING;
export const selectIsSwitching = (state: SessionStore) => state.status === SessionStatus.SWITCHING;
export const selectSessionError = (state: SessionStore) => state.error;

// ==================== Hooks ====================

export const useSessionStatus = () => useSessionStore(selectSessionStatus);
export const useCurrentSessionNotebookId = () => useSessionStore(selectCurrentNotebookId);
export const useIsSessionConnected = () => useSessionStore(selectIsConnected);
export const useIsSessionDisconnected = () => useSessionStore(selectIsDisconnected);
export const useIsSessionLoading = () => useSessionStore(selectIsLoading);
export const useIsSessionSwitching = () => useSessionStore(selectIsSwitching);
export const useSessionError = () => useSessionStore(selectSessionError);

export default useSessionStore;
