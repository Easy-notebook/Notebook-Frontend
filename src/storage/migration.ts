// storage/migration.ts
// Data migration from legacy storage systems

import { IndexedDBManager } from './database';
import { NotebookORM } from './notebookOrm';
import { FileORM } from './fileOrm';
import type { NotebookEntity, FileMetadataEntity } from './schema';

/**
 * Legacy database names to check for migration
 */
const LEGACY_DB_NAMES = [
  'easyremote-file-cache',
  'easyremote-file-cache-v2', 
  'easyremote-file-cache-v3'
];

/**
 * Legacy file object interface
 */
interface LegacyFileObject {
  id: string;
  notebookId: string;
  path: string;
  name: string;
  content: string;
  type: string;
  lastModified: string;
  size: number;
  cachedAt: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Migration statistics
 */
export interface MigrationStats {
  notebooksFound: number;
  notebooksMigrated: number;
  filesFound: number;
  filesMigrated: number;
  errors: string[];
  duration: number;
}

/**
 * Data migration manager
 */
export class DataMigration {
  /**
   * Check if migration is needed
   */
  static async isMigrationNeeded(): Promise<boolean> {
    try {
      // Check if we have any notebooks in the new system
      const notebooks = await NotebookORM.getNotebooks({ limit: 1 });
      if (notebooks.length > 0) {
        return false; // Already have data in new system
      }

      // Check if legacy databases exist with data
      for (const dbName of LEGACY_DB_NAMES) {
        const hasLegacyData = await this.checkLegacyDatabase(dbName);
        if (hasLegacyData) {
          console.log(`Found legacy data in ${dbName}, migration needed`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn('Error checking migration need:', error);
      return false;
    }
  }

  /**
   * Perform full data migration
   */
  static async migrate(): Promise<MigrationStats> {
    const startTime = Date.now();
    const stats: MigrationStats = {
      notebooksFound: 0,
      notebooksMigrated: 0,
      filesFound: 0,
      filesMigrated: 0,
      errors: [],
      duration: 0
    };

    console.log('Starting data migration from legacy databases...');

    try {
      // Try to migrate from each legacy database
      for (const dbName of LEGACY_DB_NAMES) {
        try {
          const legacyStats = await this.migrateLegacyDatabase(dbName);
          stats.notebooksFound += legacyStats.notebooksFound;
          stats.notebooksMigrated += legacyStats.notebooksMigrated;
          stats.filesFound += legacyStats.filesFound;
          stats.filesMigrated += legacyStats.filesMigrated;
          stats.errors.push(...legacyStats.errors);
          
          if (legacyStats.notebooksMigrated > 0 || legacyStats.filesMigrated > 0) {
            console.log(`Migrated from ${dbName}:`, {
              notebooks: legacyStats.notebooksMigrated,
              files: legacyStats.filesMigrated
            });
          }
        } catch (error) {
          const errorMsg = `Failed to migrate from ${dbName}: ${error}`;
          console.error(errorMsg);
          stats.errors.push(errorMsg);
        }
      }

      stats.duration = Date.now() - startTime;
      
      console.log('Migration completed:', {
        notebooks: stats.notebooksMigrated,
        files: stats.filesMigrated,
        duration: `${stats.duration}ms`,
        errors: stats.errors.length
      });

      return stats;
    } catch (error) {
      stats.errors.push(`Migration failed: ${error}`);
      stats.duration = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Check if a legacy database has data
   */
  private static async checkLegacyDatabase(dbName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const request = indexedDB.open(dbName);
      
      request.onsuccess = () => {
        const db = request.result;
        try {
          // Check if database has any object stores with data
          const storeNames = Array.from(db.objectStoreNames);
          if (storeNames.length === 0) {
            db.close();
            resolve(false);
            return;
          }

          // Check first store for data
          const transaction = db.transaction(storeNames, 'readonly');
          const store = transaction.objectStore(storeNames[0]);
          const countRequest = store.count();
          
          countRequest.onsuccess = () => {
            db.close();
            resolve(countRequest.result > 0);
          };
          
          countRequest.onerror = () => {
            db.close();
            resolve(false);
          };
        } catch (error) {
          db.close();
          resolve(false);
        }
      };
      
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
      
      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  }

  /**
   * Migrate data from a specific legacy database
   */
  private static async migrateLegacyDatabase(dbName: string): Promise<MigrationStats> {
    const stats: MigrationStats = {
      notebooksFound: 0,
      notebooksMigrated: 0,
      filesFound: 0,
      filesMigrated: 0,
      errors: [],
      duration: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      
      request.onsuccess = async () => {
        const db = request.result;
        try {
          const storeNames = Array.from(db.objectStoreNames);
          
          // Look for common legacy store names
          const fileStoreName = storeNames.find(name => 
            name.includes('file') || name.includes('cache') || name === 'files'
          );
          
          if (!fileStoreName) {
            db.close();
            stats.duration = Date.now() - stats.duration;
            resolve(stats);
            return;
          }

          // Read all files from legacy store
          const transaction = db.transaction([fileStoreName], 'readonly');
          const store = transaction.objectStore(fileStoreName);
          const request = store.getAll();
          
          request.onsuccess = async () => {
            db.close();
            
            const legacyFiles = request.result as LegacyFileObject[];
            stats.filesFound = legacyFiles.length;
            
            if (legacyFiles.length === 0) {
              stats.duration = Date.now() - stats.duration;
              resolve(stats);
              return;
            }

            // Group files by notebook
            const notebookFiles = new Map<string, LegacyFileObject[]>();
            
            for (const file of legacyFiles) {
              if (!file.notebookId) continue;
              
              if (!notebookFiles.has(file.notebookId)) {
                notebookFiles.set(file.notebookId, []);
              }
              notebookFiles.get(file.notebookId)!.push(file);
            }

            stats.notebooksFound = notebookFiles.size;

            // Migrate each notebook
            for (const [notebookId, files] of notebookFiles) {
              try {
                // Create notebook entity
                const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
                const lastAccessed = Math.max(...files.map(f => f.lastAccessed || f.cachedAt || Date.now()));
                const accessCount = Math.max(...files.map(f => f.accessCount || 0));

                const notebook: Omit<NotebookEntity, 'createdAt' | 'updatedAt'> = {
                  id: notebookId,
                  name: `Notebook ${notebookId.slice(0, 8)}`,
                  description: `Migrated notebook with ${files.length} files`,
                  lastAccessedAt: lastAccessed,
                  accessCount: accessCount,
                  fileCount: files.length,
                  totalSize: totalSize,
                  cacheEnabled: true
                };

                await NotebookORM.saveNotebook(notebook);
                stats.notebooksMigrated++;

                // Migrate files for this notebook
                for (const legacyFile of files) {
                  try {
                    await FileORM.saveFile({
                      notebookId: legacyFile.notebookId,
                      filePath: legacyFile.path,
                      fileName: legacyFile.name,
                      content: legacyFile.content || '',
                      lastModified: legacyFile.lastModified || new Date().toISOString(),
                      size: legacyFile.size || 0,
                      remoteUrl: undefined
                    });
                    
                    stats.filesMigrated++;
                  } catch (error) {
                    const errorMsg = `Failed to migrate file ${legacyFile.path}: ${error}`;
                    console.warn(errorMsg);
                    stats.errors.push(errorMsg);
                  }
                }
              } catch (error) {
                const errorMsg = `Failed to migrate notebook ${notebookId}: ${error}`;
                console.warn(errorMsg);
                stats.errors.push(errorMsg);
              }
            }

            stats.duration = Date.now() - stats.duration;
            resolve(stats);
          };
          
          request.onerror = () => {
            db.close();
            reject(new Error(`Failed to read data from ${fileStoreName}`));
          };
          
        } catch (error) {
          db.close();
          reject(error);
        }
      };
      
      request.onerror = () => {
        reject(new Error(`Failed to open legacy database ${dbName}`));
      };
      
      request.onblocked = () => {
        reject(new Error(`Legacy database ${dbName} is blocked`));
      };
      
      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error(`Migration from ${dbName} timed out`));
      }, 30000);
    });
  }

  /**
   * Force migration by clearing new database first
   */
  static async forceMigration(): Promise<MigrationStats> {
    console.log('Performing force migration - clearing new database first');
    
    try {
      // Clear all data in new database
      const notebooks = await NotebookORM.getNotebooks();
      for (const notebook of notebooks) {
        await NotebookORM.deleteNotebook(notebook.id);
      }
      
      // Now perform migration
      return await this.migrate();
    } catch (error) {
      console.error('Force migration failed:', error);
      throw error;
    }
  }
}