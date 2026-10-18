/**
 * @fileoverview NotebookSessionService - Manages notebook session lifecycle
 * Coordinates between storage, auto-save, and UI state
 *
 * Responsibilities:
 * - Session lifecycle management (connect, disconnect, switch)
 * - Coordinating with AutoSaveService for persistence
 * - Loading notebook data from storage
 * - Managing session state transitions
 */

import { AutoSaveService } from '@Services/autoSave';
import { notebookLog } from '@Utils/logger';
import {
  SessionStatus,
  type NotebookSession,
  type SessionEvent,
  type SessionEventListener,
  type SessionState,
  type ISessionService,
  INITIAL_SESSION_STATE,
} from './types';

/**
 * NotebookSessionService - Singleton service for notebook session management
 */
export class NotebookSessionService implements ISessionService {
  private static instance: NotebookSessionService | null = null;

  private state: SessionState = { ...INITIAL_SESSION_STATE };
  private listeners: Set<SessionEventListener> = new Set();
  private autoSave: AutoSaveService;
  private isInitialized = false;
  private readonly isDevelopment = import.meta.env.DEV === true;

  private constructor() {
    this.autoSave = AutoSaveService.getInstance();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): NotebookSessionService {
    if (!NotebookSessionService.instance) {
      NotebookSessionService.instance = new NotebookSessionService();
    }
    return NotebookSessionService.instance;
  }

  /**
   * Initialize the session service
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      notebookLog.info('Initializing NotebookSessionService');

      // Initialize auto-save service
      await this.autoSave.initialize();

      this.isInitialized = true;
      notebookLog.info('NotebookSessionService initialized');
    } catch (error) {
      notebookLog.error('Failed to initialize NotebookSessionService', { error });
      throw error;
    }
  }

  /**
   * Connect to a notebook session (load and activate)
   * Used when navigating to /workspace/:id
   */
  public async connect(notebookId: string): Promise<NotebookSession | null> {
    if (!notebookId?.trim()) {
      throw new Error('Invalid notebook ID');
    }

    // If already connected to this notebook, skip
    if (
      this.state.currentNotebookId === notebookId &&
      this.state.status === SessionStatus.CONNECTED
    ) {
      if (this.isDevelopment) {
        notebookLog.debug('Already connected to notebook', { notebookId });
      }
      return null;
    }

    try {
      if (this.isDevelopment) {
        console.log('🔍 [NotebookSessionService] Connecting to notebook', { notebookId });
      }

      // Resume auto-save if it was paused
      if (this.autoSave.isPaused()) {
        this.autoSave.resume();
      }

      // Check if notebook is already loaded in store (e.g., just created)
      let notebookStore = await this.getNotebookStore();
      const alreadyLoaded =
        notebookStore.notebookId === notebookId &&
        notebookStore.isLoaded &&
        notebookStore.isInitialized &&
        !notebookStore.error;

      if (!alreadyLoaded) {
        this.setStatus(SessionStatus.LOADING);
        this.emit({ type: 'session_started', notebookId, timestamp: Date.now() });

        const loaded = await notebookStore.loadFromDatabase(notebookId);
        // Zustand replaces its state object. The pre-load snapshot is no longer authoritative.
        notebookStore = await this.getNotebookStore();
        if (!loaded) throw new Error(notebookStore.error || 'Failed to load notebook');
      }
      if (notebookStore.notebookId !== notebookId) {
        throw new Error('Loaded notebook identity does not match the requested session');
      }

      // Capture the validated result before publishing to reentrant observers.
      const session: NotebookSession = {
        notebookId,
        notebookTitle: notebookStore.notebookTitle,
        cells: notebookStore.cells,
        tasks: notebookStore.tasks,
        lastAccessedAt: Date.now(),
      };
      this.state.currentNotebookId = notebookId;
      this.state.error = null;
      this.setStatus(SessionStatus.CONNECTED);
      this.emit({ type: 'session_loaded', notebookId, timestamp: Date.now() });

      if (this.isDevelopment) {
        console.log('✅ [NotebookSessionService] Connected to notebook', {
          notebookId,
          cellCount: session?.cells?.length || 0,
        });
      }

      return session;
    } catch (error) {
      notebookLog.error('Failed to connect to notebook', { notebookId, error });
      this.state.error = error instanceof Error ? error.message : 'Connection failed';
      this.setStatus(SessionStatus.DISCONNECTED);

      this.emit({
        type: 'session_error',
        notebookId,
        error: this.state.error,
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Disconnect from current session (clear and pause)
   * Used when navigating to "/" route
   */
  public async disconnect(): Promise<void> {
    const currentNotebookId = this.state.currentNotebookId;

    // Already disconnected
    if (this.state.status === SessionStatus.DISCONNECTED && !currentNotebookId) {
      if (this.isDevelopment) {
        notebookLog.debug('Already disconnected');
      }
      return;
    }

    try {
      if (this.isDevelopment) {
        console.log('🔍 [NotebookSessionService] Disconnecting', { currentNotebookId });
      }

      // Pause auto-save (which will save current state first)
      if (currentNotebookId) {
        // Get current notebook state from notebookStore for final save
        const notebookStore = await this.getNotebookStore();
        const snapshot =
          notebookStore.notebookId === currentNotebookId
            ? {
                notebookId: currentNotebookId,
                notebookTitle: notebookStore.notebookTitle || '',
                cells: notebookStore.cells || [],
                tasks: notebookStore.tasks || [],
                timestamp: Date.now(),
              }
            : undefined;

        // Queued snapshots retain their own identity when the editor has moved on.
        await this.autoSave.pause(snapshot);
      } else {
        await this.autoSave.pause();
      }

      // Update state
      this.state.currentNotebookId = null;
      this.state.error = null;
      this.setStatus(SessionStatus.DISCONNECTED);

      this.emit({
        type: 'session_ended',
        previousNotebookId: currentNotebookId || undefined,
        timestamp: Date.now(),
      });

      if (this.isDevelopment) {
        console.log('✅ [NotebookSessionService] Disconnected', {
          previousNotebookId: currentNotebookId,
        });
      }
    } catch (error) {
      notebookLog.error('Failed to disconnect', { error });
      // A failed pause leaves the accepted edits and active session available for retry.
      this.state.error = error instanceof Error ? error.message : 'Disconnect failed';
      this.emit({
        type: 'session_error',
        notebookId: currentNotebookId || undefined,
        error: this.state.error,
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  /**
   * Switch to a different notebook session
   * Handles saving current state and loading new notebook
   */
  public async switchSession(notebookId: string): Promise<NotebookSession | null> {
    if (!notebookId?.trim()) {
      throw new Error('Invalid notebook ID');
    }

    const previousNotebookId = this.state.currentNotebookId;
    const previousStatus = this.state.status;

    // Same notebook, no switch needed
    if (previousNotebookId === notebookId) {
      if (this.isDevelopment) {
        notebookLog.debug('Already on this notebook', { notebookId });
      }
      return null;
    }

    try {
      this.setStatus(SessionStatus.SWITCHING);

      if (this.isDevelopment) {
        console.log('🔍 [NotebookSessionService] Switching notebooks', {
          from: previousNotebookId,
          to: notebookId,
        });
      }

      // The queue owns notebook identity. A different editor snapshot does not
      // invalidate already accepted edits, and unrelated saves cannot gate navigation.
      if (previousNotebookId && !this.autoSave.isPaused()) {
        await this.autoSave.flush(previousNotebookId);
      }

      // Load new notebook
      const session = await this.connect(notebookId);

      this.emit({
        type: 'session_switched',
        notebookId,
        previousNotebookId: previousNotebookId || undefined,
        timestamp: Date.now(),
      });

      if (this.isDevelopment) {
        console.log('✅ [NotebookSessionService] Switched notebooks', {
          from: previousNotebookId,
          to: notebookId,
        });
      }

      return session;
    } catch (error) {
      notebookLog.error('Failed to switch notebooks', { notebookId, error });
      this.state.error = error instanceof Error ? error.message : 'Switch failed';
      if (this.state.status === SessionStatus.SWITCHING) this.setStatus(previousStatus);

      this.emit({
        type: 'session_error',
        notebookId,
        error: this.state.error,
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Get notebook store state (dynamic import to avoid circular deps)
   */
  private async getNotebookStore() {
    const { default: useNotebookStore } = await import('@Store/notebookStore');
    return useNotebookStore.getState();
  }

  /**
   * Get current status
   */
  public getStatus(): SessionStatus {
    return this.state.status;
  }

  /**
   * Get current notebook ID
   */
  public getCurrentNotebookId(): string | null {
    return this.state.currentNotebookId;
  }

  /**
   * Check if connected to a notebook
   */
  public isConnected(): boolean {
    return this.state.status === SessionStatus.CONNECTED;
  }

  /**
   * Check if disconnected
   */
  public isDisconnected(): boolean {
    return this.state.status === SessionStatus.DISCONNECTED;
  }

  /**
   * Get full state (for debugging)
   */
  public getState(): SessionState {
    return { ...this.state };
  }

  /**
   * Subscribe to session events
   */
  public subscribe(listener: SessionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Set status and emit event
   */
  private setStatus(status: SessionStatus): void {
    if (this.state.status !== status) {
      this.state.status = status;
      this.emit({
        type: 'status_changed',
        status,
        notebookId: this.state.currentNotebookId || undefined,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: SessionEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        notebookLog.error('Session event listener error', { error });
      }
    });
  }

  /**
   * Reset for testing
   */
  public static resetInstance(): void {
    NotebookSessionService.instance = null;
  }
}

// Export convenience function
export const getSessionService = (): NotebookSessionService => {
  return NotebookSessionService.getInstance();
};
