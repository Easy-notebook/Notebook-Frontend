/**
 * @fileoverview Session module exports
 * Provides unified access to notebook session management
 */

// Types
export {
  SessionStatus,
  type NotebookSession,
  type SessionEvent,
  type SessionEventListener,
  type SessionEventType,
  type SessionState,
  type ISessionService,
  INITIAL_SESSION_STATE,
} from './types';

// Service
export { NotebookSessionService, getSessionService } from './NotebookSessionService';

// Store
export {
  default as useSessionStore,
  type SessionStore,
  type SessionStoreActions,
  // Selectors
  selectSessionStatus,
  selectCurrentNotebookId,
  selectIsConnected,
  selectIsDisconnected,
  selectIsLoading,
  selectIsSwitching,
  selectSessionError,
  // Hooks
  useSessionStatus,
  useCurrentSessionNotebookId,
  useIsSessionConnected,
  useIsSessionDisconnected,
  useIsSessionLoading,
  useIsSessionSwitching,
  useSessionError,
} from './sessionStore';
