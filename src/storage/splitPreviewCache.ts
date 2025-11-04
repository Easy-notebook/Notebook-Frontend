// storage/splitPreviewCache.ts
// Independent cache system for split preview functionality
// Completely isolated from tab system and FileCache/FileORM

export interface SplitFileData {
  id: string;
  notebookId: string;
  filePath: string;
  fileName: string;
  content: string;
  type: string;
  size: number;
  lastModified: string;
  cachedAt: number;
  metadata?: any;
}

/**
 * Independent cache system for split preview
 * Uses its own IndexedDB store to avoid conflicts with tab system
 */
export class SplitPreviewCache {
  private static DB_NAME = 'EasyNotebook_SplitPreview';
  private static DB_VERSION = 1;
  private static STORE_NAME = 'split_files';
  
  private static db: IDBDatabase | null = null;

  /**
   * Initialize the split preview database
   */
  private static async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create split files store
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('notebookId', 'notebookId', { unique: false });
          store.createIndex('filePath', 'filePath', { unique: false });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
        }
      };
    });
  }

  /**
   * Get a file from split preview cache
   */
  static async getFile(notebookId: string, filePath: string): Promise<SplitFileData | null> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const key = `${notebookId}::${filePath}`;
      const request = store.get(key);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            console.log(`💾 Split cache hit: ${filePath}`);
          }
          resolve(result || null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get file from split preview cache:', error);
      return null;
    }
  }

  /**
   * Save a file to split preview cache
   */
  static async saveFile(notebookId: string, filePath: string, fileData: any): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const splitFileData: SplitFileData = {
        id: `${notebookId}::${filePath}`,
        notebookId,
        filePath,
        fileName: fileData.name,
        content: fileData.content,
        type: fileData.type,
        size: fileData.size,
        lastModified: fileData.lastModified,
        cachedAt: Date.now(),
        metadata: fileData.metadata
      };
      
      const request = store.put(splitFileData);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log(`💾 Split cache saved: ${filePath}`);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to save file to split preview cache:', error);
    }
  }

  /**
   * Delete a file from split preview cache
   */
  static async deleteFile(notebookId: string, filePath: string): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const key = `${notebookId}::${filePath}`;
      const request = store.delete(key);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log(`🗑️ Split cache deleted: ${filePath}`);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to delete file from split preview cache:', error);
    }
  }

  /**
   * Clear all cached files for a notebook
   */
  static async clearNotebook(notebookId: string): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('notebookId');
      
      const request = index.openCursor(IDBKeyRange.only(notebookId));
      
      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            console.log(`🧹 Split cache cleared for notebook: ${notebookId}`);
            resolve();
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to clear split preview cache for notebook:', error);
    }
  }

  /**
   * Clear all split preview cache
   */
  static async clearAll(): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const request = store.clear();
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log('🧹 Split cache completely cleared');
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to clear all split preview cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<{ totalFiles: number; totalSize: number }> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const request = store.getAll();
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const files: SplitFileData[] = request.result;
          const totalFiles = files.length;
          const totalSize = files.reduce((sum, file) => sum + file.size, 0);
          
          resolve({ totalFiles, totalSize });
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get split preview cache stats:', error);
      return { totalFiles: 0, totalSize: 0 };
    }
  }

  /**
   * Clean up old cache entries (older than 7 days)
   */
  static async cleanup(): Promise<number> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('cachedAt');
      
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      const range = IDBKeyRange.upperBound(cutoffTime);
      const request = index.openCursor(range);
      
      let deletedCount = 0;
      
      return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            deletedCount++;
            cursor.continue();
          } else {
            console.log(`🧹 Split cache cleanup: deleted ${deletedCount} old files`);
            resolve(deletedCount);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to cleanup split preview cache:', error);
      return 0;
    }
  }
}