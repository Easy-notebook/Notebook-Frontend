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
  type NotebookSnapshot,
  type LoadedNotebook,
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
export function createAutoSaveStore(service: AutoSaveService) {
  const store = create<AutoSaveStore>()(
    subscribeWithSelector(() => ({
      ...service.getState(),
      initialize: () => service.initialize(),
      queueSave: (snapshot: NotebookSnapshot) => service.queueSave(snapshot),
      saveNow: (snapshot: NotebookSnapshot) => service.saveNow(snapshot),
      load: (notebookId: string) => service.load(notebookId),
      hasPending: (notebookId?: string) => service.hasPending(notebookId),
      clearPending: (notebookId: string) => service.clearPending(notebookId),
      flush: (notebookId?: string) => service.flush(notebookId),
      waitForComplete: () => service.waitForComplete(),
      clearError: () => service.clearError(),
      pause: (snapshot?: NotebookSnapshot) => service.pause(snapshot),
      resume: () => service.resume(),
      isPaused: () => service.isPaused(),
    }))
  );
  const unsubscribe = service.subscribe((event) => store.setState(event.state));
  return { store, unsubscribe };
}

const binding = createAutoSaveStore(AutoSaveService.getInstance());
const useAutoSaveStore = binding.store;
const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
hot?.dispose(binding.unsubscribe);

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
