/**
 * @fileoverview Auto-save service for real-time notebook content synchronization
 * Provides debounced saving with data loss prevention and optimized performance
 */

import { debounce } from 'lodash-es';
import { NotebookORM, FileORM, StorageManager } from '@Storage/index';
import type { Cell, Task } from '@Store/notebookStore';
import { notebookLog, storageLog } from '../utils/logger';

interface NotebookSnapshot {
  notebookId: string;
  notebookTitle: string;
  cells: Cell[];
  tasks: Task[];
  timestamp: number;
}

interface LoadedNotebook {
  notebookTitle: string;
  cells: Cell[];
  tasks: Task[];
}

interface SaveResult {
  id: string;
  hasLocalContent: boolean;
  storageType: string;
  size: number;
}

type CellType = 'code' | 'markdown' | 'hybrid' | 'raw' | 'image' | 'thinking' | 'link';

/**
 * Auto-save service for notebook content with singleton pattern
 * Provides debounced saving, data validation, and storage management
 */
export class NotebookAutoSave {
  private static instance: NotebookAutoSave | null = null;
  private readonly saveQueue = new Map<string, NotebookSnapshot>();
  private isInitialized = false;
  private saveInProgress = false;
  private readonly isDevelopment = process.env.NODE_ENV === 'development';

  // Debounced save function with 25ms delay
  private readonly debouncedSave = debounce(async (): Promise<void> => {
    await this.processSaveQueue();
  }, 25);

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance of NotebookAutoSave
   * @returns The singleton instance
   */
  static getInstance(): NotebookAutoSave {
    if (!this.instance) {
      this.instance = new NotebookAutoSave();
    }
    return this.instance;
  }

  /**
   * Initialize auto-save service and storage
   * @throws Error if initialization fails
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      notebookLog.info('Initializing notebook auto-save service');
      
      // Ensure storage is initialized
      await StorageManager.initialize();
      
      this.isInitialized = true;
      notebookLog.info('Notebook auto-save service initialized successfully');
    } catch (error) {
      notebookLog.error('Failed to initialize notebook auto-save service', { error });
      throw error;
    }
  }

  /**
   * Queue a notebook for debounced saving with data loss prevention
   * @param snapshot - The notebook snapshot to save
   * @throws Error if save validation fails
   */
  async queueSave(snapshot: NotebookSnapshot): Promise<void> {
    if (!this.isInitialized) {
      notebookLog.warn('Auto-save service not initialized, skipping save queue');
      return;
    }

    // Log save request in development mode
    if (this.isDevelopment) {
      notebookLog.debug('Queuing save for notebook', {
        notebookId: snapshot.notebookId,
        title: snapshot.notebookTitle,
        cellsCount: snapshot.cells?.length || 0,
        tasksCount: snapshot.tasks?.length || 0
      });
    }
    
    // Safety check: prevent accidental data loss from empty cells
    if (!snapshot.cells || snapshot.cells.length === 0) {
      try {
        const existingData = await NotebookAutoSave.loadNotebook(snapshot.notebookId);
        if (existingData?.cells && existingData.cells.length > 0) {
          notebookLog.warn('Preventing data loss: notebook has existing content, skipping empty save', {
            notebookId: snapshot.notebookId,
            existingCellsCount: existingData.cells.length,
            snapshotTitle: snapshot.title,
            existingTitle: existingData.title,
            reason: 'Empty snapshot would overwrite existing content'
          });
          return;
        } else {
          // Allow empty save for truly new/empty notebooks
          notebookLog.debug('Empty save allowed: target notebook is also empty', {
            notebookId: snapshot.notebookId,
            existingCellsCount: existingData?.cells?.length || 0
          });
        }
      } catch (error) {
        // If we can't check existing content, be conservative and allow the save
        notebookLog.warn('Failed to check existing notebook content, proceeding with save', { 
          notebookId: snapshot.notebookId,
          error: error.message,
          decision: 'allowing_save_due_to_check_failure'
        });
      }
    }

    // Update the queue with latest snapshot
    this.saveQueue.set(snapshot.notebookId, {
      ...snapshot,
      timestamp: Date.now()
    });

    // Trigger debounced save
    this.debouncedSave();
  }

  /**
   * Process the save queue and persist all queued notebooks
   * @private
   */
  private async processSaveQueue(): Promise<void> {
    if (this.saveInProgress || this.saveQueue.size === 0) {
      return;
    }

    this.saveInProgress = true;
    
    try {
      const snapshots = Array.from(this.saveQueue.values());
      this.saveQueue.clear();

      notebookLog.info('Processing notebook saves', { count: snapshots.length });

      for (const snapshot of snapshots) {
        try {
          await this.saveNotebook(snapshot);
        } catch (error) {
          notebookLog.error('Failed to save notebook', {
            notebookId: snapshot.notebookId,
            error
          });
          // Continue with other notebooks even if one fails
        }
      }
    } finally {
      this.saveInProgress = false;
    }
  }

  /**
   * Save notebook snapshot to database with metadata and content
   * @param snapshot - The notebook snapshot to save
   * @throws Error if save operation fails
   * @private
   */
  private async saveNotebook(snapshot: NotebookSnapshot): Promise<void> {
    const { notebookId, notebookTitle, cells, tasks, timestamp } = snapshot;

    try {
      // 1. Update notebook metadata
      await NotebookORM.saveNotebook({
        id: notebookId,
        name: notebookTitle || `Notebook ${notebookId.slice(0, 8)}`,
        description: '',
        lastAccessedAt: timestamp,
        accessCount: 1,
        fileCount: cells.length,
        totalSize: this.calculateContentSize(cells),
        cacheEnabled: true
      });

      // 2. Save notebook content as a single main file
      const notebookContent = JSON.stringify({
        notebook_id: notebookId,
        title: notebookTitle,
        notebookTitle: notebookTitle,
        cells: cells || [],
        tasks: tasks || [],
        saved_at: timestamp,
        version: '2.0',
        metadata: {
          totalCells: cells?.length || 0,
          hasImages: cells?.some(c => c.type === 'image') || false,
          lastSaved: new Date(timestamp).toISOString()
        }
      }, null, 2);

      if (this.isDevelopment) {
        notebookLog.lifecycleEvent('save', notebookId, {
          title: notebookTitle,
          cellsCount: cells?.length || 0,
          tasksCount: tasks?.length || 0,
          contentLength: notebookContent.length
        });
      }

      const saveResult: SaveResult = await FileORM.saveFile({
        notebookId,
        filePath: `notebook_${notebookId}.json`,
        fileName: `${notebookTitle || 'Untitled'}.easynb`,
        content: notebookContent,
        lastModified: new Date(timestamp).toISOString(),
        size: new Blob([notebookContent]).size,
        remoteUrl: undefined
      });
      
      if (this.isDevelopment) {
        storageLog.debug('File save result', {
          fileId: saveResult.id,
          hasLocalContent: saveResult.hasLocalContent,
          storageType: saveResult.storageType,
          size: saveResult.size
        });
      }

      notebookLog.info('Notebook auto-saved successfully', {
        notebookId,
        cellsCount: cells.length
      });
    } catch (error) {
      notebookLog.error('Failed to auto-save notebook', { notebookId, error });
      throw error;
    }
  }

  /**
   * Calculate total content size of all cells in bytes
   * @param cells - Array of notebook cells
   * @returns Total size in bytes
   * @private
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
   * Load notebook from database with validation
   * @param notebookId - The unique identifier of the notebook
   * @returns Promise resolving to loaded notebook data or null if not found
   * @throws Error if notebookId is invalid or load fails
   */
  static async loadNotebook(notebookId: string): Promise<LoadedNotebook | null> {
    if (!notebookId?.trim()) {
      throw new Error('Invalid notebook ID provided');
    }

    try {
      notebookLog.debug('Loading notebook from database', { notebookId });

      // Try to load main notebook file first
      const expectedFilePath = `notebook_${notebookId}.json`;
      const mainFile = await FileORM.getFile(notebookId, expectedFilePath);
      
      if (mainFile?.content) {
        try {
          const data = JSON.parse(mainFile.content);
          
          // Validate parsed data structure
          if (typeof data !== 'object' || data === null) {
            throw new Error('Invalid notebook data structure');
          }
          
          return {
            notebookTitle: data.title || data.notebookTitle || 'Untitled',
            cells: Array.isArray(data.cells) ? data.cells : [],
            tasks: Array.isArray(data.tasks) ? data.tasks : []
          };
        } catch (parseError) {
          notebookLog.warn('Failed to parse notebook file', { 
            notebookId,
            error: parseError 
          });
          if (process.env.NODE_ENV === 'development') {
            notebookLog.debug('Raw content preview', {
              notebookId,
              preview: mainFile.content.substring(0, 200)
            });
          }
        }
      }

      // Fallback: try to load from notebook metadata
      const notebook = await NotebookORM.getNotebook(notebookId);
      
      if (!notebook) {
        notebookLog.debug('Notebook not found in database', { notebookId });
        return null;
      }

      notebookLog.info('Loaded notebook metadata only - cells will be empty', { 
        notebookId 
      });

      return {
        notebookTitle: notebook.name,
        cells: [],
        tasks: []
      };
    } catch (error) {
      notebookLog.error('Failed to load notebook', { notebookId, error });
      throw new Error(`Failed to load notebook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Immediate save bypassing debouncing mechanism
   * @param snapshot - The notebook snapshot to save immediately
   * @throws Error if save operation fails
   */
  async saveNow(snapshot: NotebookSnapshot): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    await this.saveNotebook(snapshot);
  }

  /**
   * Clear pending saves for a specific notebook
   * @param notebookId - The notebook ID to clear from save queue
   */
  clearPendingSave(notebookId: string): void {
    this.saveQueue.delete(notebookId);
  }

  /**
   * Get count of notebooks pending save
   * @returns Number of notebooks in save queue
   */
  getPendingSaveCount(): number {
    return this.saveQueue.size;
  }
}

// Export singleton instance
export default NotebookAutoSave.getInstance();