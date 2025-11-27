/**
 * @fileoverview AutoSave service types and interfaces
 * Provides type definitions for the auto-save system with OOP design
 */

import type { Cell, Task } from '@Store/models';

/**
 * AutoSave status enum - represents the current state of auto-save
 */
export enum AutoSaveStatus {
  /** No save operation in progress, ready for new operations */
  IDLE = 'idle',
  /** Loading data from persistent storage to store */
  LOADING = 'loading',
  /** Syncing data from store to persistent storage */
  SYNCING = 'syncing',
  /** Disconnected from persistence, no sync operations (e.g., on / route) */
  DISCONNECTED = 'disconnected',
}

/**
 * Notebook snapshot for saving
 */
export interface NotebookSnapshot {
  notebookId: string;
  notebookTitle: string;
  cells: Cell[];
  tasks: Task[];
  timestamp: number;
}

/**
 * Loaded notebook data structure
 */
export interface LoadedNotebook {
  notebookTitle: string;
  cells: Cell[];
  tasks: Task[];
}

/**
 * AutoSave configuration options
 */
export interface AutoSaveConfig {
  /** Debounce delay in milliseconds */
  debounceMs: number;
  /** Whether auto-save is enabled */
  enabled: boolean;
  /** Maximum retry attempts on failure */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelayMs: number;
}

/**
 * AutoSave state for store synchronization
 */
export interface AutoSaveState {
  /** Current status of auto-save */
  status: AutoSaveStatus;
  /** Last successful save timestamp */
  lastSavedAt: number | null;
  /** Current error message if any */
  error: string | null;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Number of pending saves in queue */
  pendingCount: number;
  /** Currently active notebook ID */
  activeNotebookId: string | null;
}

/**
 * AutoSave event types for observers
 */
export type AutoSaveEventType =
  | 'status_changed'
  | 'save_started'
  | 'save_completed'
  | 'save_failed'
  | 'load_started'
  | 'load_completed'
  | 'load_failed'
  | 'dirty_changed';

/**
 * AutoSave event payload
 */
export interface AutoSaveEvent {
  type: AutoSaveEventType;
  notebookId?: string;
  status: AutoSaveStatus;
  error?: string;
  timestamp: number;
  isDirty?: boolean;
}

/**
 * AutoSave event listener callback
 */
export type AutoSaveEventListener = (event: AutoSaveEvent) => void;

/**
 * AutoSave service interface - defines the contract for auto-save implementations
 */
export interface IAutoSaveService {
  /** Initialize the service and underlying persistence layer */
  initialize(): Promise<void>;

  /** Get current status */
  getStatus(): AutoSaveStatus;

  /** Get full current state */
  getState(): AutoSaveState;

  /** Check if service is initialized */
  isInitialized(): boolean;

  /** Queue a save operation (debounced) */
  queueSave(snapshot: NotebookSnapshot): Promise<void>;

  /** Save immediately without debouncing */
  saveNow(snapshot: NotebookSnapshot): Promise<void>;

  /** Load a notebook from storage */
  load(notebookId: string): Promise<LoadedNotebook | null>;

  /** Check if there are pending saves for a notebook */
  hasPending(notebookId?: string): boolean;

  /** Clear pending save for a specific notebook */
  clearPending(notebookId: string): void;

  /** Flush all pending saves immediately */
  flush(notebookId?: string): Promise<void>;

  /** Wait for current SYNCING operation to complete */
  waitForComplete(): Promise<void>;

  /**
   * Pause auto-save (enter DISCONNECTED state)
   * Used when navigating to / route to create new notebook
   * Will save current notebook first if needed
   */
  pause(currentSnapshot?: NotebookSnapshot): Promise<void>;

  /**
   * Resume auto-save (exit DISCONNECTED state)
   * Used when navigating to /workspace route
   */
  resume(): void;

  /**
   * Check if auto-save is paused (DISCONNECTED)
   */
  isPaused(): boolean;

  /** Subscribe to state change events */
  subscribe(listener: AutoSaveEventListener): () => void;

  /** Dispose and cleanup resources */
  dispose(): void;
}

/**
 * Default auto-save configuration
 */
export const DEFAULT_AUTOSAVE_CONFIG: AutoSaveConfig = {
  debounceMs: 25,
  enabled: true,
  maxRetries: 3,
  retryDelayMs: 1000,
};

/**
 * Initial auto-save state
 */
export const INITIAL_AUTOSAVE_STATE: AutoSaveState = {
  status: AutoSaveStatus.IDLE,
  lastSavedAt: null,
  error: null,
  isDirty: false,
  pendingCount: 0,
  activeNotebookId: null,
};
