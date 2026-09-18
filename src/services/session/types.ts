/**
 * @fileoverview NotebookSession types and interfaces
 * Defines the session lifecycle states and related types
 */

import type { Cell, Task } from '@Store/models';

/**
 * Session lifecycle states
 */
export enum SessionStatus {
  /** No active session - on home route "/" */
  DISCONNECTED = 'disconnected',
  /** Loading notebook from storage */
  LOADING = 'loading',
  /** Session active and connected */
  CONNECTED = 'connected',
  /** Switching between notebooks */
  SWITCHING = 'switching',
}

/**
 * Notebook session data
 */
export interface NotebookSession {
  notebookId: string;
  notebookTitle: string;
  cells: Cell[];
  tasks: Task[];
  lastAccessedAt: number;
}

/**
 * Session event types
 */
export type SessionEventType =
  | 'status_changed'
  | 'session_started'
  | 'session_ended'
  | 'session_switched'
  | 'session_loaded'
  | 'session_error';

/**
 * Session event payload
 */
export interface SessionEvent {
  type: SessionEventType;
  status?: SessionStatus;
  notebookId?: string;
  previousNotebookId?: string;
  error?: string;
  timestamp: number;
}

/**
 * Session event listener
 */
export type SessionEventListener = (event: SessionEvent) => void;

/**
 * Session state
 */
export interface SessionState {
  status: SessionStatus;
  currentNotebookId: string | null;
  error: string | null;
  lastSessionTimestamp: number | null;
}

/**
 * Session service interface
 */
export interface ISessionService {
  // Lifecycle
  initialize(): Promise<void>;

  // Session management
  connect(notebookId: string): Promise<NotebookSession | null>;
  disconnect(): Promise<void>;
  switchSession(notebookId: string): Promise<NotebookSession | null>;

  // State access
  getStatus(): SessionStatus;
  getCurrentNotebookId(): string | null;
  isConnected(): boolean;
  isDisconnected(): boolean;

  // Event subscription
  subscribe(listener: SessionEventListener): () => void;
}

/**
 * Initial session state
 */
export const INITIAL_SESSION_STATE: SessionState = {
  status: SessionStatus.DISCONNECTED,
  currentNotebookId: null,
  error: null,
  lastSessionTimestamp: null,
};
