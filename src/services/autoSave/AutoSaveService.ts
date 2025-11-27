/**
 * @fileoverview AutoSaveService - OOP implementation for notebook auto-save
 * Provides debounced saving, state management, and data loss prevention
 */

import { debounce } from 'lodash-es';
import { PersistenceService } from '../persistence/PersistenceService';
import type { IPersistenceService } from '../persistence/interfaces';
import type { Cell } from '@Store/models';
import { notebookLog, storageLog } from '@Utils/logger';

import {
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

/**
 * AutoSaveService - Singleton service for managing notebook auto-save
 *
 * Features:
 * - Debounced saving to prevent excessive writes
 * - State machine with IDLE/LOADING/SYNCING states
 * - Wait mechanism to prevent race conditions
 * - Event-based state synchronization with frontend store
 * - Data loss prevention
 */
export class AutoSaveService implements IAutoSaveService {
  // Singleton instance
  private static instance: AutoSaveService | null = null;

  // Dependencies
  private readonly persistence: IPersistenceService;
  private readonly config: AutoSaveConfig;

  // Internal state
  private state: AutoSaveState;
  private initialized = false;
  private readonly isDevelopment: boolean = import.meta.env.DEV === true;

  // Save queue management
  private readonly saveQueue: Map<string, NotebookSnapshot> = new Map();
  private readonly debouncedSave: ReturnType<typeof debounce>;

  // Sync completion promise management
  private syncCompletePromise: Promise<void> | null = null;
  private syncCompleteResolve: (() => void) | null = null;

  // Event listeners
  private readonly listeners: Set<AutoSaveEventListener> = new Set();

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: Partial<AutoSaveConfig> = {}) {
    this.config = { ...DEFAULT_AUTOSAVE_CONFIG, ...config };
    this.state = { ...INITIAL_AUTOSAVE_STATE };
    this.persistence = new PersistenceService();

    // Create debounced save function
    this.debouncedSave = debounce(async () => this.processSaveQueue(), this.config.debounceMs);

    if (this.isDevelopment) {
      notebookLog.info('AutoSaveService: Instance created', { config: this.config });
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<AutoSaveConfig>): AutoSaveService {
    if (!AutoSaveService.instance) {
      AutoSaveService.instance = new AutoSaveService(config);
    }
    return AutoSaveService.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (AutoSaveService.instance) {
      AutoSaveService.instance.dispose();
      AutoSaveService.instance = null;
    }
  }

  // ==================== Public API ====================

  /**
   * Initialize the service and persistence layer
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      notebookLog.info('AutoSaveService: Initializing...');
      await this.persistence.initialize();
      this.initialized = true;
      notebookLog.info('AutoSaveService: Initialized successfully');
    } catch (error) {
      notebookLog.error('AutoSaveService: Initialization failed', { error });
      throw error;
    }
  }

  /**
   * Check if service is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current status
   */
  public getStatus(): AutoSaveStatus {
    return this.state.status;
  }

  /**
   * Get full current state
   */
  public getState(): AutoSaveState {
    return { ...this.state };
  }

  /**
   * Queue a save operation (debounced)
   */
  public async queueSave(snapshot: NotebookSnapshot): Promise<void> {
    // Skip if paused (DISCONNECTED state - e.g., on / route)
    if (this.state.status === AutoSaveStatus.DISCONNECTED) {
      notebookLog.debug('AutoSaveService: Paused (DISCONNECTED), skipping save');
      return;
    }

    if (!this.initialized) {
      notebookLog.warn('AutoSaveService: Not initialized, initializing now...');
      await this.initialize();
    }

    if (!this.config.enabled) {
      notebookLog.debug('AutoSaveService: Auto-save disabled, skipping');
      return;
    }

    // Validate snapshot
    if (!this.validateSnapshot(snapshot)) {
      return;
    }

    // Check for data loss prevention
    if (await this.shouldPreventDataLoss(snapshot)) {
      return;
    }

    // Update queue with latest snapshot
    this.saveQueue.set(snapshot.notebookId, {
      ...snapshot,
      timestamp: Date.now(),
    });

    // Update state
    this.updateState({
      isDirty: true,
      pendingCount: this.saveQueue.size,
      activeNotebookId: snapshot.notebookId,
    });

    this.emitEvent('dirty_changed', snapshot.notebookId);

    if (this.isDevelopment) {
      notebookLog.debug('AutoSaveService: Save queued', {
        notebookId: snapshot.notebookId,
        cellsCount: snapshot.cells.length,
        queueSize: this.saveQueue.size,
      });
    }

    // Trigger debounced save
    this.debouncedSave();
  }

  /**
   * Save immediately without debouncing
   */
  public async saveNow(snapshot: NotebookSnapshot): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Cancel any pending debounced saves for this notebook
    this.saveQueue.delete(snapshot.notebookId);

    // Save directly
    await this.performSave(snapshot);
  }

  /**
   * Load a notebook from storage
   */
  public async load(notebookId: string): Promise<LoadedNotebook | null> {
    if (!notebookId?.trim()) {
      throw new Error('AutoSaveService: Invalid notebook ID');
    }

    if (!this.initialized) {
      await this.initialize();
    }

    // Wait for any ongoing sync to complete first
    if (this.state.status === AutoSaveStatus.SYNCING) {
      await this.waitForComplete();
    }

    try {
      this.setStatus(AutoSaveStatus.LOADING);
      this.updateState({ activeNotebookId: notebookId });
      this.emitEvent('load_started', notebookId);

      notebookLog.debug('AutoSaveService: Loading notebook', { notebookId });

      const result = await this.loadFromPersistence(notebookId);

      this.setStatus(AutoSaveStatus.IDLE);
      this.updateState({
        isDirty: false,
        error: null,
      });
      this.emitEvent('load_completed', notebookId);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.setStatus(AutoSaveStatus.IDLE);
      this.updateState({ error: errorMsg });
      this.emitEvent('load_failed', notebookId, errorMsg);

      notebookLog.error('AutoSaveService: Load failed', { notebookId, error });
      throw error;
    }
  }

  /**
   * Check if there are pending saves
   */
  public hasPending(notebookId?: string): boolean {
    if (notebookId) {
      return this.saveQueue.has(notebookId);
    }
    return this.saveQueue.size > 0;
  }

  /**
   * Clear pending save for a specific notebook
   */
  public clearPending(notebookId: string): void {
    this.saveQueue.delete(notebookId);
    this.updateState({ pendingCount: this.saveQueue.size });

    if (this.isDevelopment) {
      notebookLog.debug('AutoSaveService: Pending save cleared', { notebookId });
    }
  }

  /**
   * Flush all pending saves immediately
   */
  public async flush(notebookId?: string): Promise<void> {
    // Cancel debounced save
    this.debouncedSave.cancel();

    if (notebookId) {
      // Flush specific notebook
      const snapshot = this.saveQueue.get(notebookId);
      if (snapshot) {
        this.saveQueue.delete(notebookId);
        await this.performSave(snapshot);
      }
    } else {
      // Flush all pending saves
      await this.processSaveQueue();
    }
  }

  /**
   * Wait for current SYNCING operation to complete
   */
  public async waitForComplete(): Promise<void> {
    if (this.state.status !== AutoSaveStatus.SYNCING) {
      return;
    }

    if (!this.syncCompletePromise) {
      return;
    }

    notebookLog.debug('AutoSaveService: Waiting for sync to complete...');
    await this.syncCompletePromise;
    notebookLog.debug('AutoSaveService: Sync completed');
  }

  /**
   * Pause auto-save (enter DISCONNECTED state)
   * Used when navigating to / route to create new notebook
   * Will save current notebook first if needed
   */
  public async pause(currentSnapshot?: NotebookSnapshot): Promise<void> {
    notebookLog.info('AutoSaveService: Pausing...', {
      currentStatus: this.state.status,
      hasSnapshot: !!currentSnapshot,
    });

    // Step 1: Wait for any ongoing SYNCING to complete
    if (this.state.status === AutoSaveStatus.SYNCING) {
      await this.waitForComplete();
    }

    // Step 2: Flush any pending saves
    if (this.saveQueue.size > 0) {
      await this.flush();
    }

    // Step 3: Save current snapshot if provided
    if (currentSnapshot && currentSnapshot.notebookId) {
      try {
        await this.performSave(currentSnapshot);
      } catch (error) {
        notebookLog.error('AutoSaveService: Failed to save before pause', { error });
        // Continue with pause even if save fails
      }
    }

    // Step 4: Cancel debounced save
    this.debouncedSave.cancel();

    // Step 5: Clear queue and enter DISCONNECTED state
    this.saveQueue.clear();
    this.setStatus(AutoSaveStatus.DISCONNECTED);
    this.updateState({
      isDirty: false,
      pendingCount: 0,
      activeNotebookId: null,
    });

    notebookLog.info('AutoSaveService: Paused (DISCONNECTED)');
  }

  /**
   * Resume auto-save (exit DISCONNECTED state)
   * Used when navigating to /workspace route
   */
  public resume(): void {
    if (this.state.status !== AutoSaveStatus.DISCONNECTED) {
      notebookLog.debug('AutoSaveService: Not in DISCONNECTED state, no need to resume');
      return;
    }

    this.setStatus(AutoSaveStatus.IDLE);
    notebookLog.info('AutoSaveService: Resumed (IDLE)');
  }

  /**
   * Check if auto-save is paused (DISCONNECTED)
   */
  public isPaused(): boolean {
    return this.state.status === AutoSaveStatus.DISCONNECTED;
  }

  /**
   * Subscribe to state change events
   */
  public subscribe(listener: AutoSaveEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Dispose and cleanup resources
   */
  public dispose(): void {
    this.debouncedSave.cancel();
    this.saveQueue.clear();
    this.listeners.clear();
    this.initialized = false;
    this.state = { ...INITIAL_AUTOSAVE_STATE };

    notebookLog.info('AutoSaveService: Disposed');
  }

  // ==================== Private Methods ====================

  /**
   * Process the save queue
   */
  private async processSaveQueue(): Promise<void> {
    if (this.saveQueue.size === 0) {
      return;
    }

    // Get all snapshots and clear queue
    const snapshots = Array.from(this.saveQueue.values());
    this.saveQueue.clear();

    notebookLog.info('AutoSaveService: Processing save queue', { count: snapshots.length });

    // Save each snapshot
    for (const snapshot of snapshots) {
      try {
        await this.performSave(snapshot);
      } catch (error) {
        notebookLog.error('AutoSaveService: Failed to save notebook', {
          notebookId: snapshot.notebookId,
          error,
        });
        // Continue with other notebooks even if one fails
      }
    }
  }

  /**
   * Perform actual save operation
   */
  private async performSave(snapshot: NotebookSnapshot): Promise<void> {
    const { notebookId, notebookTitle, cells, tasks, timestamp } = snapshot;

    // Create sync complete promise
    this.createSyncPromise();

    try {
      this.setStatus(AutoSaveStatus.SYNCING);
      this.emitEvent('save_started', notebookId);

      // 1. Save notebook metadata
      await this.persistence.notebooks.saveNotebook({
        id: notebookId,
        name: notebookTitle || `Notebook ${notebookId.slice(0, 8)}`,
        description: '',
        lastAccessedAt: timestamp,
        accessCount: 1,
        fileCount: cells.length,
        totalSize: this.calculateContentSize(cells),
        cacheEnabled: true,
      });

      // 2. Save notebook content as JSON file
      const notebookContent = JSON.stringify(
        {
          notebook_id: notebookId,
          title: notebookTitle,
          notebookTitle: notebookTitle,
          cells: cells || [],
          tasks: tasks || [],
          saved_at: timestamp,
          version: '2.0',
          metadata: {
            totalCells: cells?.length || 0,
            hasImages: cells?.some((c) => c.type === 'image') || false,
            lastSaved: new Date(timestamp).toISOString(),
          },
        },
        null,
        2
      );

      if (this.isDevelopment) {
        notebookLog.lifecycleEvent('save', notebookId, {
          title: notebookTitle,
          cellsCount: cells?.length || 0,
          tasksCount: tasks?.length || 0,
          contentLength: notebookContent.length,
        });
      }

      const saveResult = await this.persistence.files.saveFile({
        notebookId,
        filePath: `notebook_${notebookId}.json`,
        fileName: `${notebookTitle || 'Untitled'}.easynb`,
        content: notebookContent,
        lastModified: new Date(timestamp).toISOString(),
        size: new Blob([notebookContent]).size,
        remoteUrl: undefined,
      });

      if (this.isDevelopment) {
        storageLog.debug('AutoSaveService: File save result', {
          fileId: saveResult.id,
          hasLocalContent: saveResult.hasLocalContent,
          storageType: saveResult.storageType,
          size: saveResult.size,
        });
      }

      // Update state on success
      this.setStatus(AutoSaveStatus.IDLE);
      this.updateState({
        lastSavedAt: timestamp,
        isDirty: this.saveQueue.size > 0,
        pendingCount: this.saveQueue.size,
        error: null,
      });
      this.emitEvent('save_completed', notebookId);

      notebookLog.info('AutoSaveService: Notebook saved', {
        notebookId,
        cellsCount: cells.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.setStatus(AutoSaveStatus.IDLE);
      this.updateState({ error: errorMsg });
      this.emitEvent('save_failed', notebookId, errorMsg);

      notebookLog.error('AutoSaveService: Save failed', { notebookId, error });
      throw error;
    } finally {
      // Resolve sync complete promise
      this.resolveSyncPromise();
    }
  }

  /**
   * Load notebook from persistence layer
   */
  private async loadFromPersistence(notebookId: string): Promise<LoadedNotebook | null> {
    // Try to load main notebook file first
    const expectedFilePath = `notebook_${notebookId}.json`;
    const mainFile = await this.persistence.files.getFile(notebookId, expectedFilePath);

    if (mainFile?.content) {
      try {
        const data = JSON.parse(mainFile.content);

        if (typeof data !== 'object' || data === null) {
          throw new Error('Invalid notebook data structure');
        }

        const loadedCells = Array.isArray(data.cells) ? data.cells : [];

        if (this.isDevelopment) {
          const codeCellsWithOutputs = loadedCells.filter(
            (c: Cell) => c.type === 'code' && c.outputs && c.outputs.length > 0
          );
          console.log('AutoSaveService: Loaded notebook from storage:', {
            notebookId: notebookId.slice(0, 8),
            totalCells: loadedCells.length,
            codeCellsWithOutputs: codeCellsWithOutputs.length,
          });
        }

        return {
          notebookTitle: data.title || data.notebookTitle || 'Untitled',
          cells: loadedCells,
          tasks: Array.isArray(data.tasks) ? data.tasks : [],
        };
      } catch (parseError) {
        notebookLog.warn('AutoSaveService: Failed to parse notebook file', {
          notebookId,
          error: parseError,
        });
      }
    }

    // Fallback: try to load from notebook metadata
    const notebook = await this.persistence.notebooks.getNotebook(notebookId);

    if (!notebook) {
      notebookLog.debug('AutoSaveService: Notebook not found', { notebookId });
      return null;
    }

    notebookLog.info('AutoSaveService: Loaded metadata only', { notebookId });

    return {
      notebookTitle: notebook.name,
      cells: [],
      tasks: [],
    };
  }

  /**
   * Validate snapshot before saving
   */
  private validateSnapshot(snapshot: NotebookSnapshot): boolean {
    if (!snapshot.notebookId?.trim()) {
      notebookLog.warn('AutoSaveService: Invalid notebookId, skipping save');
      return false;
    }
    return true;
  }

  /**
   * Check if save should be prevented to avoid data loss
   */
  private async shouldPreventDataLoss(snapshot: NotebookSnapshot): Promise<boolean> {
    if (!snapshot.cells || snapshot.cells.length === 0) {
      try {
        const existingData = await this.loadFromPersistence(snapshot.notebookId);
        if (existingData?.cells && existingData.cells.length > 0) {
          notebookLog.warn('AutoSaveService: Preventing data loss - empty save blocked', {
            notebookId: snapshot.notebookId,
            existingCellsCount: existingData.cells.length,
          });
          return true;
        }
      } catch (error) {
        // If we can't check, allow the save
        notebookLog.warn('AutoSaveService: Failed to check existing content, allowing save', {
          notebookId: snapshot.notebookId,
          error,
        });
      }
    }
    return false;
  }

  /**
   * Calculate total content size of cells
   */
  private calculateContentSize(cells: Cell[]): number {
    let totalSize = 0;
    for (const cell of cells) {
      totalSize += new Blob([cell.content || '']).size;
      if (cell.outputs?.length) {
        totalSize += new Blob([JSON.stringify(cell.outputs)]).size;
      }
    }
    return totalSize;
  }

  /**
   * Update internal state
   */
  private updateState(updates: Partial<AutoSaveState>): void {
    this.state = { ...this.state, ...updates };
  }

  /**
   * Set status with event emission
   */
  private setStatus(status: AutoSaveStatus): void {
    if (this.state.status !== status) {
      this.state.status = status;
      this.emitEvent('status_changed');
    }
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(type: AutoSaveEventType, notebookId?: string, error?: string): void {
    const event: AutoSaveEvent = {
      type,
      notebookId,
      status: this.state.status,
      error,
      timestamp: Date.now(),
      isDirty: this.state.isDirty,
    };

    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        notebookLog.error('AutoSaveService: Event listener error', { error: e });
      }
    });
  }

  /**
   * Create sync completion promise
   */
  private createSyncPromise(): void {
    this.syncCompletePromise = new Promise<void>((resolve) => {
      this.syncCompleteResolve = resolve;
    });
  }

  /**
   * Resolve sync completion promise
   */
  private resolveSyncPromise(): void {
    if (this.syncCompleteResolve) {
      this.syncCompleteResolve();
      this.syncCompleteResolve = null;
      this.syncCompletePromise = null;
    }
  }
}

// Export singleton instance getter
export const getAutoSaveService = (config?: Partial<AutoSaveConfig>): AutoSaveService => {
  return AutoSaveService.getInstance(config);
};

export default AutoSaveService;
