/**
 * @fileoverview AutoSave Store - Zustand store for frontend state synchronization
 * Connects AutoSaveService events to reactive UI state
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { AutoSaveService } from './AutoSaveService';
import {
  AutoSaveStatus,
  type AutoSaveState,
  type AutoSaveEvent,
  type NotebookSnapshot,
  type LoadedNotebook,
  INITIAL_AUTOSAVE_STATE,
} from './types';

/**
 * AutoSave store actions interface
 */
export interface AutoSaveStoreActions {
  /** Initialize the auto-save service */
  initialize: () => Promise<void>;

  /** Queue a save operation (debounced) */
  queueSave: (snapshot: NotebookSnapshot) => Promise<void>;

  /** Save immediately without debouncing */
  saveNow: (snapshot: NotebookSnapshot) => Promise<void>;

  /** Load a notebook from storage */
  load: (notebookId: string) => Promise<LoadedNotebook | null>;

  /** Check if there are pending saves */
  hasPending: (notebookId?: string) => boolean;

  /** Clear pending save for a specific notebook */
  clearPending: (notebookId: string) => void;

  /** Flush all pending saves immediately */
  flush: (notebookId?: string) => Promise<void>;

  /** Wait for current SYNCING to complete */
  waitForComplete: () => Promise<void>;

  /** Clear error state */
  clearError: () => void;

  /** Set dirty state manually */
  setDirty: (isDirty: boolean) => void;

  /**
   * Pause auto-save (enter DISCONNECTED state)
   * Used when navigating to / route
   */
  pause: (currentSnapshot?: NotebookSnapshot) => Promise<void>;

  /**
   * Resume auto-save (exit DISCONNECTED state)
   * Used when navigating to /workspace route
   */
  resume: () => void;

  /**
   * Check if auto-save is paused
   */
  isPaused: () => boolean;
}

/**
 * Full AutoSave store type
 */
export type AutoSaveStore = AutoSaveState & AutoSaveStoreActions;

/**
 * Create the AutoSave store with service integration
 */
const useAutoSaveStore = create<AutoSaveStore>()(
  subscribeWithSelector((set) => {
    // Get service instance
    const service = AutoSaveService.getInstance();

    // Subscribe to service events and sync state
    service.subscribe((event: AutoSaveEvent) => {
      handleServiceEvent(set, event);
    });

    return {
      // Initial state
      ...INITIAL_AUTOSAVE_STATE,

      // Actions
      initialize: async () => {
        try {
          await service.initialize();
          const state = service.getState();
          set({
            status: state.status,
            error: null,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Initialization failed',
          });
          throw error;
        }
      },

      queueSave: async (snapshot: NotebookSnapshot) => {
        try {
          await service.queueSave(snapshot);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Save failed',
          });
          throw error;
        }
      },

      saveNow: async (snapshot: NotebookSnapshot) => {
        try {
          await service.saveNow(snapshot);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Save failed',
          });
          throw error;
        }
      },

      load: async (notebookId: string) => {
        try {
          set({ activeNotebookId: notebookId });
          return await service.load(notebookId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Load failed',
          });
          throw error;
        }
      },

      hasPending: (notebookId?: string) => {
        return service.hasPending(notebookId);
      },

      clearPending: (notebookId: string) => {
        service.clearPending(notebookId);
        set({ pendingCount: 0 });
      },

      flush: async (notebookId?: string) => {
        try {
          await service.flush(notebookId);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Flush failed',
          });
          throw error;
        }
      },

      waitForComplete: async () => {
        await service.waitForComplete();
      },

      clearError: () => {
        set({ error: null });
      },

      setDirty: (isDirty: boolean) => {
        set({ isDirty });
      },

      pause: async (currentSnapshot?: NotebookSnapshot) => {
        try {
          await service.pause(currentSnapshot);
          // State will be updated via event subscription
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Pause failed',
          });
          throw error;
        }
      },

      resume: () => {
        service.resume();
        // State will be updated via event subscription
      },

      isPaused: () => {
        return service.isPaused();
      },
    };
  })
);

/**
 * Handle service events and update store state
 */
function handleServiceEvent(
  set: (state: Partial<AutoSaveState>) => void,
  event: AutoSaveEvent
): void {
  switch (event.type) {
    case 'status_changed':
      set({ status: event.status });
      break;

    case 'save_started':
      set({
        status: AutoSaveStatus.SYNCING,
        activeNotebookId: event.notebookId || null,
      });
      break;

    case 'save_completed':
      set({
        status: AutoSaveStatus.IDLE,
        lastSavedAt: event.timestamp,
        isDirty: false,
        error: null,
      });
      break;

    case 'save_failed':
      set({
        status: AutoSaveStatus.IDLE,
        error: event.error || 'Save failed',
      });
      break;

    case 'load_started':
      set({
        status: AutoSaveStatus.LOADING,
        activeNotebookId: event.notebookId || null,
      });
      break;

    case 'load_completed':
      set({
        status: AutoSaveStatus.IDLE,
        isDirty: false,
        error: null,
      });
      break;

    case 'load_failed':
      set({
        status: AutoSaveStatus.IDLE,
        error: event.error || 'Load failed',
      });
      break;

    case 'dirty_changed':
      set({ isDirty: event.isDirty ?? false });
      break;
  }
}

// ==================== Selectors ====================

/**
 * Select current status
 */
export const selectAutoSaveStatus = (state: AutoSaveStore) => state.status;

/**
 * Select if currently syncing
 */
export const selectIsSyncing = (state: AutoSaveStore) => state.status === AutoSaveStatus.SYNCING;

/**
 * Select if currently loading
 */
export const selectIsLoading = (state: AutoSaveStore) => state.status === AutoSaveStatus.LOADING;

/**
 * Select if idle
 */
export const selectIsIdle = (state: AutoSaveStore) => state.status === AutoSaveStatus.IDLE;

/**
 * Select if disconnected (paused)
 */
export const selectIsDisconnected = (state: AutoSaveStore) =>
  state.status === AutoSaveStatus.DISCONNECTED;

/**
 * Select if has unsaved changes
 */
export const selectIsDirty = (state: AutoSaveStore) => state.isDirty;

/**
 * Select last saved timestamp
 */
export const selectLastSavedAt = (state: AutoSaveStore) => state.lastSavedAt;

/**
 * Select error message
 */
export const selectError = (state: AutoSaveStore) => state.error;

/**
 * Select active notebook ID
 */
export const selectActiveNotebookId = (state: AutoSaveStore) => state.activeNotebookId;

// ==================== Hooks ====================

/**
 * Hook to get auto-save status
 */
export const useAutoSaveStatus = () => useAutoSaveStore(selectAutoSaveStatus);

/**
 * Hook to check if syncing
 */
export const useIsSyncing = () => useAutoSaveStore(selectIsSyncing);

/**
 * Hook to check if loading
 */
export const useIsLoading = () => useAutoSaveStore(selectIsLoading);

/**
 * Hook to check if idle
 */
export const useIsIdle = () => useAutoSaveStore(selectIsIdle);

/**
 * Hook to check if disconnected (paused)
 */
export const useIsDisconnected = () => useAutoSaveStore(selectIsDisconnected);

/**
 * Hook to check if has unsaved changes
 */
export const useIsDirty = () => useAutoSaveStore(selectIsDirty);

/**
 * Hook to get last saved timestamp
 */
export const useLastSavedAt = () => useAutoSaveStore(selectLastSavedAt);

/**
 * Hook to get error message
 */
export const useAutoSaveError = () => useAutoSaveStore(selectError);

export default useAutoSaveStore;
