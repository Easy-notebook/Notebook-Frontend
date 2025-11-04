// storage/tabCache.ts
// Tab state persistence for notebook preview tabs

import { IndexedDBManager } from './database';
import { DB_STORES } from './schema';
import { storageLog } from '../utils/logger';

export interface TabState {
  notebookId: string;
  tabList: Array<{
    id: string;
    path: string;
    name: string;
    type: string;
  }>;
  activeTabId: string | null;
  lastUpdated: number;
}

export class TabCache {
  private static readonly STORE_NAME = DB_STORES.TAB_STATES;
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (!this.initialized) {
      try {
        // Use the static IndexedDBManager to get database connection
        const db = await IndexedDBManager.getDB();
        
        // Check if our store exists, if not we need to recreate the database
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          storageLog.warn('TabCache store not found, functionality will be limited');
          // The store will be created when the database is upgraded
        }
        
        this.initialized = true;
        storageLog.info('TabCache initialized successfully');
      } catch (error) {
        storageLog.error('Failed to initialize TabCache', { error });
        // Don't throw - allow app to continue without tab persistence
        this.initialized = false;
      }
    }
  }

  static async saveTabState(notebookId: string, tabList: any[], activeTabId: string | null): Promise<void> {
    try {
      await this.initialize();
      const db = await IndexedDBManager.getDB();
      
      if (!db.objectStoreNames.contains(this.STORE_NAME)) {
        storageLog.warn('TabCache store not available, skipping save operation');
        return;
      }
      
      const tabState: TabState = {
        notebookId,
        tabList: tabList.map(tab => ({
          id: tab.id,
          path: tab.path,
          name: tab.name,
          type: tab.type
        })),
        activeTabId,
        lastUpdated: Date.now()
      };

      const transaction = db.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const request = store.put(tabState);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLog.error('Failed to save tab state', { notebookId, error });
    }
  }

  static async getTabState(notebookId: string): Promise<TabState | null> {
    try {
      await this.initialize();
      const db = await IndexedDBManager.getDB();
      
      if (!db.objectStoreNames.contains(this.STORE_NAME)) {
        storageLog.warn('TabCache store not available, returning null');
        return null;
      }
      
      const transaction = db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      return new Promise<TabState | null>((resolve, reject) => {
        const request = store.get(notebookId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLog.error('Failed to get tab state', { notebookId, error });
      return null;
    }
  }

  static async removeTabState(notebookId: string): Promise<void> {
    try {
      await this.initialize();
      const db = await IndexedDBManager.getDB();
      
      if (!db.objectStoreNames.contains(this.STORE_NAME)) {
        storageLog.warn('TabCache store not available, skipping remove operation');
        return;
      }
      
      const transaction = db.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(notebookId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLog.error('Failed to remove tab state', { notebookId, error });
    }
  }

  static async getAllTabStates(): Promise<TabState[]> {
    try {
      await this.initialize();
      const db = await IndexedDBManager.getDB();
      
      if (!db.objectStoreNames.contains(this.STORE_NAME)) {
        storageLog.warn('TabCache store not available, returning empty array');
        return [];
      }
      
      const transaction = db.transaction(this.STORE_NAME, 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      return new Promise<TabState[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLog.error('Failed to get all tab states', { error });
      return [];
    }
  }

  // Clean up old tab states (older than 30 days)
  static async cleanupOldStates(): Promise<number> {
    try {
      await this.initialize();
      const db = await IndexedDBManager.getDB();
      
      if (!db.objectStoreNames.contains(this.STORE_NAME)) {
        storageLog.warn('TabCache store not available, skipping cleanup');
        return 0;
      }
      
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
      
      const transaction = db.transaction(this.STORE_NAME, 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('lastUpdated');
      
      return new Promise<number>((resolve, reject) => {
        const range = IDBKeyRange.upperBound(cutoffTime);
        const request = index.openCursor(range);
        let deletedCount = 0;
        
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            const deleteRequest = store.delete(cursor.primaryKey);
            deleteRequest.onsuccess = () => {
              deletedCount++;
              cursor.continue();
            };
          } else {
            resolve(deletedCount);
          }
        };
        
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      storageLog.error('Failed to cleanup old tab states', { error });
      return 0;
    }
  }
}