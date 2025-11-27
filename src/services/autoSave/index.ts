/**
 * @fileoverview AutoSave module exports
 * Provides unified access to auto-save functionality
 */

// Types
export {
  AutoSaveStatus,
  type AutoSaveConfig,
  type AutoSaveState,
  type AutoSaveEvent,
  type AutoSaveEventListener,
  type AutoSaveEventType,
  type IAutoSaveService,
  type LoadedNotebook,
  type NotebookSnapshot,
  DEFAULT_AUTOSAVE_CONFIG,
  INITIAL_AUTOSAVE_STATE,
} from './types';

// Service
export { AutoSaveService, getAutoSaveService } from './AutoSaveService';

// Store
export {
  default as useAutoSaveStore,
  type AutoSaveStore,
  type AutoSaveStoreActions,
  // Selectors
  selectAutoSaveStatus,
  selectIsSyncing,
  selectIsLoading,
  selectIsIdle,
  selectIsDisconnected,
  selectIsDirty,
  selectLastSavedAt,
  selectError,
  selectActiveNotebookId,
  // Hooks
  useAutoSaveStatus,
  useIsSyncing,
  useIsLoading,
  useIsIdle,
  useIsDisconnected,
  useIsDirty,
  useLastSavedAt,
  useAutoSaveError,
} from './autoSaveStore';
