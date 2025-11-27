/**
 * @fileoverview StoreCleanupService - Centralized store cleanup management
 * Provides clean methods for clearing all stores when navigating away from notebook
 */

import { notebookLog } from '@Utils/logger';

/**
 * Store cleanup configuration
 */
export interface CleanupOptions {
  /** Clear notebook store (cells, tasks, etc.) */
  clearNotebook?: boolean;
  /** Clear preview store (tabs, files, etc.) */
  clearPreview?: boolean;
  /** Clear code store (kernel state, etc.) */
  clearCode?: boolean;
  /** Preserve certain fields during cleanup */
  preserve?: string[];
}

const DEFAULT_CLEANUP_OPTIONS: CleanupOptions = {
  clearNotebook: true,
  clearPreview: true,
  clearCode: true,
};

/**
 * StoreCleanupService - Singleton service for store cleanup
 */
export class StoreCleanupService {
  private static instance: StoreCleanupService | null = null;
  private readonly isDevelopment = import.meta.env.DEV === true;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): StoreCleanupService {
    if (!StoreCleanupService.instance) {
      StoreCleanupService.instance = new StoreCleanupService();
    }
    return StoreCleanupService.instance;
  }

  /**
   * Clean all stores - used when navigating to home "/" or creating new notebook
   */
  public async cleanAll(options: CleanupOptions = DEFAULT_CLEANUP_OPTIONS): Promise<void> {
    if (this.isDevelopment) {
      console.log('🧹 [StoreCleanupService] Cleaning all stores', options);
    }
    notebookLog.info('Cleaning all stores', options);

    const promises: Promise<void>[] = [];

    if (options.clearNotebook) {
      promises.push(this.cleanNotebookStore());
    }

    if (options.clearPreview) {
      promises.push(this.cleanPreviewStore());
    }

    if (options.clearCode) {
      promises.push(this.cleanCodeStore());
    }

    await Promise.all(promises);

    // Also clean localStorage to prevent stale data on next page load
    this.cleanLocalStorage();

    if (this.isDevelopment) {
      console.log('✅ [StoreCleanupService] All stores cleaned');
    }
    notebookLog.info('All stores cleaned');
  }

  /**
   * Clean notebook store - clears notebookId, cells, tasks, etc.
   */
  public async cleanNotebookStore(): Promise<void> {
    try {
      const { default: useNotebookStore } = await import('@Store/notebookStore');

      useNotebookStore.setState({
        notebookId: null,
        notebookTitle: '',
        cells: [],
        tasks: [],
        currentPhaseId: null,
        currentStepIndex: 0,
        currentCellId: null,
        currentRunningPhaseId: null,
        lastAddedCellId: null,
        error: null,
        editingCellId: null,
        whatPurposeOfThisNotebook: null,
        whatHaveWeDone: null,
        whatIsOurCurrentWork: null,
        showButtons: {},
        detachedCellId: null,
        isDetachedCellFullscreen: false,
        isInitialized: false,
        isLoaded: false,
      });

      if (this.isDevelopment) {
        console.log('🧹 [StoreCleanupService] NotebookStore cleaned');
      }
    } catch (error) {
      notebookLog.error('Failed to clean notebook store', { error });
      throw error;
    }
  }

  /**
   * Clean preview store - clears currentNotebookId, tabs, files, etc.
   */
  public async cleanPreviewStore(): Promise<void> {
    try {
      const { default: usePreviewStore } = await import('@Store/previewStore');
      const previewStore = usePreviewStore.getState();

      // Use the built-in clearNotebookState method
      previewStore.clearNotebookState();

      if (this.isDevelopment) {
        console.log('🧹 [StoreCleanupService] PreviewStore cleaned');
      }
    } catch (error) {
      notebookLog.error('Failed to clean preview store', { error });
      throw error;
    }
  }

  /**
   * Clean code store - resets kernel state
   */
  public async cleanCodeStore(): Promise<void> {
    try {
      const { default: useCodeStore } = await import('@Store/codeStore');

      // Use the built-in resetAll method if available
      const codeStore = useCodeStore.getState();
      if (typeof codeStore.resetAll === 'function') {
        codeStore.resetAll();
      } else {
        // Fallback: manually reset state
        useCodeStore.setState({
          isKernelReady: false,
          error: null,
          cellExecStates: {},
          cellModes: {},
        });
      }

      if (this.isDevelopment) {
        console.log('🧹 [StoreCleanupService] CodeStore cleaned');
      }
    } catch (error) {
      notebookLog.error('Failed to clean code store', { error });
      throw error;
    }
  }

  /**
   * Clean localStorage data related to stores
   * Use this to clear stale persisted data
   */
  public cleanLocalStorage(): void {
    try {
      // Remove preview-store to clear any stale notebook references
      // The store will be re-initialized with fresh state on next access
      const previewStoreData = localStorage.getItem('preview-store');
      if (previewStoreData) {
        try {
          const parsed = JSON.parse(previewStoreData);
          // Remove any notebook-related data from persisted state
          if (parsed?.state) {
            delete parsed.state.currentNotebookId;
            delete parsed.state.currentPreviewFiles;
            delete parsed.state.previewMode;
            delete parsed.state.activeFile;
            delete parsed.state.skipAutoRestore;
            localStorage.setItem('preview-store', JSON.stringify(parsed));
            if (this.isDevelopment) {
              console.log('🧹 [StoreCleanupService] Cleaned preview-store localStorage');
            }
          }
        } catch {
          // If parsing fails, remove the entire item
          localStorage.removeItem('preview-store');
        }
      }

      if (this.isDevelopment) {
        console.log('✅ [StoreCleanupService] LocalStorage cleaned');
      }
    } catch (error) {
      notebookLog.error('Failed to clean localStorage', { error });
    }
  }

  /**
   * Get current notebook ID from all stores (for debugging)
   */
  public async getCurrentNotebookIds(): Promise<{
    notebookStore: string | null;
    previewStore: string | null;
    routeStore: string | null;
  }> {
    const { default: useNotebookStore } = await import('@Store/notebookStore');
    const { default: usePreviewStore } = await import('@Store/previewStore');
    const { default: useRouteStore } = await import('@Store/routeStore');

    return {
      notebookStore: useNotebookStore.getState().notebookId,
      previewStore: usePreviewStore.getState().currentNotebookId,
      routeStore: useRouteStore.getState().currentNotebookId,
    };
  }

  /**
   * Verify all stores are in sync regarding notebook ID
   */
  public async verifyStoreSync(): Promise<boolean> {
    const ids = await this.getCurrentNotebookIds();

    // All should be either null or the same ID
    const values = Object.values(ids);
    const nonNullValues = values.filter((v) => v !== null);

    if (nonNullValues.length === 0) {
      // All null - in sync (no notebook)
      return true;
    }

    // All non-null values should be the same
    const allSame = nonNullValues.every((v) => v === nonNullValues[0]);

    if (!allSame && this.isDevelopment) {
      console.warn('⚠️ [StoreCleanupService] Store IDs out of sync:', ids);
    }

    return allSame;
  }

  /**
   * Reset for testing
   */
  public static resetInstance(): void {
    StoreCleanupService.instance = null;
  }
}

// Export convenience function
export const getCleanupService = (): StoreCleanupService => {
  return StoreCleanupService.getInstance();
};

// Export default instance methods for easy access
export const cleanAllStores = (options?: CleanupOptions) =>
  StoreCleanupService.getInstance().cleanAll(options);

export const cleanNotebookStore = () => StoreCleanupService.getInstance().cleanNotebookStore();

export const cleanPreviewStore = () => StoreCleanupService.getInstance().cleanPreviewStore();

export const cleanCodeStore = () => StoreCleanupService.getInstance().cleanCodeStore();

export const cleanLocalStorage = () => StoreCleanupService.getInstance().cleanLocalStorage();
