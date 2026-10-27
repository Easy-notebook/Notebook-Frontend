// Re-export all types
export * from './types';

// Re-export all notebook services
export * from './notebook';

// Re-export auto-save module
export * from './autoSave';

// Keep session selectors domain-qualified at the aggregate boundary. Direct
// session-module imports retain their local names; autosave owns the root names.
export {
  SessionStatus,
  type NotebookSession,
  type SessionEvent,
  type SessionEventListener,
  type SessionEventType,
  type SessionState,
  type ISessionService,
  INITIAL_SESSION_STATE,
  NotebookSessionService,
  getSessionService,
  useSessionStore,
  type SessionStore,
  type SessionStoreActions,
  selectSessionStatus,
  selectCurrentNotebookId,
  selectIsConnected,
  selectIsDisconnected as selectIsSessionDisconnected,
  selectIsLoading as selectIsSessionLoading,
  selectIsSwitching,
  selectSessionError,
  useSessionStatus,
  useCurrentSessionNotebookId,
  useIsSessionConnected,
  useIsSessionDisconnected,
  useIsSessionLoading,
  useIsSessionSwitching,
  useSessionError,
} from './session';

// Re-export store management module
export * from './store';
