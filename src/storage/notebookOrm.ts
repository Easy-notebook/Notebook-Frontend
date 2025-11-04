// storage/notebookOrm.ts
// Notebook ORM for managing notebook entities and relationships

import { IndexedDBManager, DB_CONFIG } from './database';
import {
  NotebookEntity,
  FileMetadataEntity,
  NotebookActivityEntity,
} from './schema';
import { storageLog, notebookLog } from '../utils/logger';

/**
 * Notebook ORM for CRUD operations and relationship management
 */
export class NotebookORM {
  /**
   * Create or update a notebook entity
   */
  static async saveNotebook(notebookData: Omit<NotebookEntity, 'createdAt' | 'updatedAt'>): Promise<NotebookEntity> {
    const db = await IndexedDBManager.getDB();

    const now = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readwrite');
      const store = transaction.objectStore(DB_CONFIG.STORES.NOTEBOOKS);

      // Preserve createdAt if notebook already exists
      const getReq = store.get(notebookData.id);
      getReq.onsuccess = () => {
        const existing = getReq.result as NotebookEntity | undefined;
        const notebook: NotebookEntity = {
          ...notebookData,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        };

        const putReq = store.put(notebook);
        putReq.onsuccess = () => {
          // Log activity
          this.logActivity(notebook.id, 'open').catch(error => 
            storageLog.error('Failed to log notebook open activity', { error }));
          resolve(notebook);
        };
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);

      setTimeout(() => reject(new Error('Save notebook timeout')), 5000);
    });
  }

  /**
   * Get notebook by ID
   */
  static async getNotebook(notebookId: string): Promise<NotebookEntity | null> {
    const db = await IndexedDBManager.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readonly');
      const store = transaction.objectStore(DB_CONFIG.STORES.NOTEBOOKS);

      const request = store.get(notebookId);

      request.onsuccess = () => {
        const notebook = request.result as NotebookEntity | undefined;
        if (notebook) {
          // Update last accessed time
          this.updateNotebookAccess(notebookId).catch(error => 
            storageLog.error('Failed to update notebook access time', { error }));
        }
        resolve(notebook || null);
      };

      request.onerror = () => reject(request.error);

      setTimeout(() => reject(new Error('Get notebook timeout')), 3000);
    });
  }

  /**
   * Get all notebooks with optional filtering and sorting
   */
  static async getNotebooks(options: {
    orderBy?: 'lastAccessedAt' | 'updatedAt' | 'accessCount';
    limit?: number;
    offset?: number;
  } = {}): Promise<NotebookEntity[]> {
    const db = await IndexedDBManager.getDB();
    const { orderBy = 'lastAccessedAt', limit, offset = 0 } = options;

    return new Promise((resolve, reject) => {
      storageLog.debug('NotebookORM: Starting getNotebooks', { orderBy, limit, offset });
      
      const transaction = db.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readonly');
      const store = transaction.objectStore(DB_CONFIG.STORES.NOTEBOOKS);

      let request: IDBRequest;
      let timeoutId: NodeJS.Timeout;

      if (orderBy === 'lastAccessedAt' || orderBy === 'updatedAt' || orderBy === 'accessCount') {
        const index = store.index(orderBy);
        request = index.openCursor(null, 'prev'); // Descending order
      } else {
        request = store.openCursor();
      }

      const notebooks: NotebookEntity[] = [];
      let currentOffset = 0;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (currentOffset >= offset) {
            notebooks.push(cursor.value as NotebookEntity);
            if (limit && notebooks.length >= limit) {
              cleanup();
              notebookLog.debug('NotebookORM: Successfully retrieved notebooks (limited)', {
                count: notebooks.length
              });
              resolve(notebooks);
              return;
            }
          }
          currentOffset++;
          cursor.continue();
        } else {
          cleanup();
          notebookLog.debug('NotebookORM: Successfully retrieved notebooks (all)', {
            count: notebooks.length
          });
          resolve(notebooks);
        }
      };

      request.onerror = () => {
        cleanup();
        storageLog.error('NotebookORM: Database request error', { error: request.error });
        reject(request.error);
      };

      transaction.onerror = () => {
        cleanup();
        storageLog.error('NotebookORM: Transaction error', { error: transaction.error });
        reject(transaction.error);
      };

      timeoutId = setTimeout(() => {
        storageLog.warn('NotebookORM: Get notebooks operation timed out after 5 seconds');
        reject(new Error('Get notebooks timeout'));
      }, 5000);
    });
  }

  /**
   * Update notebook access statistics
   */
  static async updateNotebookAccess(notebookId: string): Promise<void> {
    const db = await IndexedDBManager.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readwrite');
      const store = transaction.objectStore(DB_CONFIG.STORES.NOTEBOOKS);

      const getRequest = store.get(notebookId);

      getRequest.onsuccess = () => {
        const notebook = getRequest.result as NotebookEntity | undefined;
        if (notebook) {
          const updatedNotebook: NotebookEntity = {
            ...notebook,
            lastAccessedAt: Date.now(),
            accessCount: notebook.accessCount + 1
          };

          const putRequest = store.put(updatedNotebook);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve(); // Notebook doesn't exist, ignore
        }
      };

      getRequest.onerror = () => reject(getRequest.error);

      setTimeout(() => reject(new Error('Update access timeout')), 3000);
    });
  }

  /**
   * Delete notebook and all associated data
   */
  static async deleteNotebook(notebookId: string): Promise<boolean> {
    const db = await IndexedDBManager.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        DB_CONFIG.STORES.NOTEBOOKS,
        DB_CONFIG.STORES.FILES_METADATA,
        DB_CONFIG.STORES.FILES_CONTENT,
        DB_CONFIG.STORES.ACTIVITIES
      ], 'readwrite');

      let operationsCompleted = 0;
      const totalOperations = 4;

      const checkCompletion = () => {
        operationsCompleted++;
        if (operationsCompleted === totalOperations) {
          resolve(true);
        }
      };

      // Delete notebook record
      const notebooksStore = transaction.objectStore(DB_CONFIG.STORES.NOTEBOOKS);
      const deleteNotebookReq = notebooksStore.delete(notebookId);
      deleteNotebookReq.onsuccess = checkCompletion;
      deleteNotebookReq.onerror = () => reject(deleteNotebookReq.error);

      // Collect file IDs for this notebook first
      const filesMetaStore = transaction.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      const metaIndex = filesMetaStore.index('notebookId');
      const collectReq = metaIndex.openCursor(notebookId);
      const fileIds: string[] = [];
      collectReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const meta = cursor.value as FileMetadataEntity;
          fileIds.push(meta.id);
          cursor.continue();
        } else {
          // Delete file contents
          const contentStore = transaction.objectStore(DB_CONFIG.STORES.FILES_CONTENT);
          if (fileIds.length === 0) {
            checkCompletion(); // No content to delete
            checkCompletion(); // No metadata to delete
            return;
          }

          let contentDeleted = 0;
          let metaDeleted = 0;

          fileIds.forEach((fileId) => {
            const delContent = contentStore.delete(fileId);
            delContent.onsuccess = () => {
              contentDeleted++;
              if (contentDeleted === fileIds.length) {
                checkCompletion();
              }
            };
            delContent.onerror = () => reject(delContent.error);
          });

          // Delete file metadata by id
          fileIds.forEach((fileId) => {
            const delMeta = filesMetaStore.delete(fileId);
            delMeta.onsuccess = () => {
              metaDeleted++;
              if (metaDeleted === fileIds.length) {
                checkCompletion();
              }
            };
            delMeta.onerror = () => reject(delMeta.error);
          });
        }
      };
      collectReq.onerror = () => reject(collectReq.error);

      // Delete activities
      const activitiesStore = transaction.objectStore(DB_CONFIG.STORES.ACTIVITIES);
      const activitiesIndex = activitiesStore.index('notebookId');
      const deleteActivitiesReq = activitiesIndex.openCursor(notebookId);
      deleteActivitiesReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          checkCompletion();
        }
      };
      deleteActivitiesReq.onerror = () => reject(deleteActivitiesReq.error);

      transaction.onerror = () => reject(transaction.error);

      setTimeout(() => reject(new Error('Delete notebook timeout')), 10000);
    });
  }

  /**
   * Get notebook statistics including file count and total size
   */
  static async getNotebookStats(notebookId: string): Promise<{
    fileCount: number;
    totalSize: number;
    lastActivity: number;
    activities: NotebookActivityEntity[];
  }> {
    const db = await IndexedDBManager.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        DB_CONFIG.STORES.FILES_METADATA,
        DB_CONFIG.STORES.ACTIVITIES
      ], 'readonly');

      let fileCount = 0;
      let totalSize = 0;
      let lastActivity = 0;
      const activities: NotebookActivityEntity[] = [];

      // Get file statistics
      const filesMetaStore = transaction.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      const metaIndex = filesMetaStore.index('notebookId');
      const filesReq = metaIndex.openCursor(notebookId);

      filesReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const fileMetadata = cursor.value as FileMetadataEntity;
          fileCount++;
          totalSize += fileMetadata.size;
          cursor.continue();
        } else {
          // Get activities
          const activitiesStore = transaction.objectStore(DB_CONFIG.STORES.ACTIVITIES);
          const activitiesIndex = activitiesStore.index('notebookId');
          const activitiesReq = activitiesIndex.openCursor(notebookId);

          activitiesReq.onsuccess = (actEvent) => {
            const actCursor = (actEvent.target as IDBRequest).result;
            if (actCursor) {
              const activity = actCursor.value as NotebookActivityEntity;
              activities.push(activity);
              lastActivity = Math.max(lastActivity, activity.timestamp);
              actCursor.continue();
            } else {
              resolve({
                fileCount,
                totalSize,
                lastActivity,
                activities: activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50) // Last 50 activities
              });
            }
          };

          activitiesReq.onerror = () => reject(activitiesReq.error);
        }
      };

      filesReq.onerror = () => reject(filesReq.error);

      setTimeout(() => reject(new Error('Get notebook stats timeout')), 5000);
    });
  }

  /**
   * Log notebook activity
   */
  static async logActivity(
    notebookId: string,
    activityType: 'open' | 'close' | 'file_access' | 'file_create' | 'file_delete',
    filePath?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const db = await IndexedDBManager.getDB();
    const timestamp = Date.now();

    const activity: NotebookActivityEntity = {
      id: `${notebookId}::${timestamp}`,
      notebookId,
      activityType,
      filePath,
      timestamp,
      metadata
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DB_CONFIG.STORES.ACTIVITIES], 'readwrite');
      const store = transaction.objectStore(DB_CONFIG.STORES.ACTIVITIES);

      const request = store.put(activity);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);

      setTimeout(() => resolve(), 1000); // Don't block on activity logging
    });
  }

  /**
   * Get inactive notebooks for cleanup
   */
  static async getInactiveNotebooks(retentionPeriod: number): Promise<NotebookEntity[]> {
    const db = await IndexedDBManager.getDB();
    const cutoffTime = Date.now() - retentionPeriod;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readonly');
      const store = transaction.objectStore(DB_CONFIG.STORES.NOTEBOOKS);
      const index = store.index('lastAccessedAt');

      const range = IDBKeyRange.upperBound(cutoffTime);
      const request = index.openCursor(range);

      const inactiveNotebooks: NotebookEntity[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          inactiveNotebooks.push(cursor.value as NotebookEntity);
          cursor.continue();
        } else {
          resolve(inactiveNotebooks);
        }
      };

      request.onerror = () => reject(request.error);

      setTimeout(() => reject(new Error('Get inactive notebooks timeout')), 5000);
    });
  }
  /**
   * Adjust notebook's fileCount and totalSize by deltas
   */
  static async adjustNotebookStats(notebookId: string, deltaFileCount: number, deltaBytes: number): Promise<void> {
    const db = await IndexedDBManager.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readwrite');
      const store = tx.objectStore(DB_CONFIG.STORES.NOTEBOOKS);
      const getReq = store.get(notebookId);
      getReq.onsuccess = () => {
        const nb = getReq.result as NotebookEntity | undefined;
        if (!nb) { resolve(); return; }
        const updated: NotebookEntity = {
          ...nb,
          fileCount: Math.max(0, (nb.fileCount || 0) + (deltaFileCount || 0)),
          totalSize: Math.max(0, (nb.totalSize || 0) + (deltaBytes || 0)),
          updatedAt: Date.now()
        };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
      setTimeout(() => resolve(), 3000);
    });
  }

  /**
   * Recalculate notebook statistics from file metadata
   */
  static async recalcNotebookStats(notebookId: string): Promise<void> {
    const db = await IndexedDBManager.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([
        DB_CONFIG.STORES.NOTEBOOKS,
        DB_CONFIG.STORES.FILES_METADATA
      ], 'readwrite');
      const nbStore = tx.objectStore(DB_CONFIG.STORES.NOTEBOOKS);
      const metaStore = tx.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      const index = metaStore.index('notebookId');
      let fileCount = 0;
      let totalSize = 0;
      const cursorReq = index.openCursor(notebookId);
      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const meta = cursor.value as FileMetadataEntity;
          fileCount++;
          totalSize += meta.size || 0;
          cursor.continue();
        } else {
          const getNbReq = nbStore.get(notebookId);
          getNbReq.onsuccess = () => {
            const nb = getNbReq.result as NotebookEntity | undefined;
            if (!nb) { resolve(); return; }
            const updated: NotebookEntity = {
              ...nb,
              fileCount,
              totalSize,
              updatedAt: Date.now()
            };
            const putReq = nbStore.put(updated);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
          };
          getNbReq.onerror = () => reject(getNbReq.error);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
      setTimeout(() => resolve(), 8000);
    });
  }

}