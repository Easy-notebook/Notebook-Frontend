// storage/database.ts
// IndexedDB database connection and management

import { DB_STORES } from './schema';
import { NotebookDatabaseSchema } from './NotebookDatabaseSchema';

// Database configuration
export const DB_CONFIG = {
  NAME: 'easyremote-notebook-cache-v2', // Changed name to avoid conflicts
  VERSION: 3, // Additive reconciliation of stores and indexes across both entry points
  STORES: DB_STORES,
} as const;

/**
 * IndexedDB connection pool for optimized database access
 */
export class IndexedDBManager {
  private static instance: IDBDatabase | null = null;
  private static initPromise: Promise<IDBDatabase> | null = null;

  /**
   * Get database connection with pooling
   */
  static async getDB(): Promise<IDBDatabase> {
    if (this.instance && this.instance.version === DB_CONFIG.VERSION) {
      return this.instance;
    }

    if (!this.initPromise) {
      this.initPromise = this.initializeDB();
    }

    return this.initPromise;
  }

  /**
   * Initialize IndexedDB database
   */
  private static async initializeDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

      // Setup timeout for initialization - increased for database upgrade
      const timeout = setTimeout(() => {
        reject(new Error('IndexedDB initialization timeout'));
      }, 20000); // Increased to 20 seconds for upgrade operations

      request.onupgradeneeded = () => {
        if (!request.transaction) return;
        NotebookDatabaseSchema.upgrade(request.result, request.transaction);
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        this.instance = request.result;
        const db = request.result;
        db.onversionchange = () => {
          if (this.instance === db) this.close();
          else db.close();
        };

        // Handle database close events
        this.instance.onclose = () => {
          this.instance = null;
          this.initPromise = null;
        };

        resolve(this.instance);
      };

      request.onerror = () => {
        clearTimeout(timeout);
        this.initPromise = null;
        reject(request.error);
      };
    });
  }

  /**
   * Close database connection
   */
  static close(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
      this.initPromise = null;
    }
  }

  /**
   * Initialize database connection
   */
  static async initialize(): Promise<void> {
    try {
      await this.getDB();
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
      throw new Error('Failed to initialize file cache database');
    }
  }
}
