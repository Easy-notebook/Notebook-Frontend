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
  type SessionEvent,
  type NotebookSession,
  INITIAL_SESSION_STATE,
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
const useSessionStore = create<SessionStore>()(
  subscribeWithSelector((set, get) => {
    // Get service instance
    const service = NotebookSessionService.getInstance();

    // Subscribe to service events
    service.subscribe((event: SessionEvent) => {
      handleServiceEvent(set, event);
    });

    return {
      // Initial state
      ...INITIAL_SESSION_STATE,

      // Actions
      initialize: async () => {
        try {
          await service.initialize();
          const state = service.getState();
          set({
            status: state.status,
            currentNotebookId: state.currentNotebookId,
            error: null,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Initialization failed',
          });
          throw error;
        }
      },

      connect: async (notebookId: string) => {
        try {
          return await service.connect(notebookId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Connection failed',
          });
          throw error;
        }
      },

      disconnect: async () => {
        try {
          await service.disconnect();
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Disconnect failed',
          });
          throw error;
        }
      },

      switchSession: async (notebookId: string) => {
        try {
          return await service.switchSession(notebookId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Switch failed',
          });
          throw error;
        }
      },

      isConnected: () => {
        return get().status === SessionStatus.CONNECTED;
      },

      isDisconnected: () => {
        return get().status === SessionStatus.DISCONNECTED;
      },

      clearError: () => {
        set({ error: null });
      },
    };
  })
);

/**
 * Handle service events and update store state
 */
function handleServiceEvent(
  set: (state: Partial<SessionState>) => void,
  event: SessionEvent
): void {
  switch (event.type) {
    case 'status_changed':
      set({ status: event.status });
      break;

    case 'session_started':
      set({
        status: SessionStatus.LOADING,
        currentNotebookId: event.notebookId || null,
      });
      break;

    case 'session_loaded':
      set({
        status: SessionStatus.CONNECTED,
        error: null,
      });
      break;

    case 'session_ended':
      set({
        status: SessionStatus.DISCONNECTED,
        currentNotebookId: null,
        error: null,
      });
      break;

    case 'session_switched':
      set({
        status: SessionStatus.CONNECTED,
        currentNotebookId: event.notebookId || null,
        error: null,
      });
      break;

    case 'session_error':
      set({
        error: event.error || 'Unknown error',
      });
      break;
  }
}

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
