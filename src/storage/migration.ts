// storage/migration.ts
// Data migration from legacy storage systems

import { persistenceService } from '../services/persistence/instance';
import type { NotebookEntity } from './schema';
import { LegacyDatabaseReader } from './LegacyDatabaseReader';

/**
 * Legacy database names to check for migration
 */
const LEGACY_DB_NAMES = [
  'easyremote-file-cache',
  'easyremote-file-cache-v2',
  'easyremote-file-cache-v3',
];

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
      duration: 0,
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
              files: legacyStats.filesMigrated,
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
        errors: stats.errors.length,
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
    return (await new LegacyDatabaseReader(dbName, 'probe', 5000).run()).hasFiles;
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
      duration: Date.now(),
    };

    const { files: legacyFiles } = await new LegacyDatabaseReader(dbName, 'files', 30000).run();
    stats.filesFound = legacyFiles.length;
    const notebookFiles = new Map<string, typeof legacyFiles>();
    for (const file of legacyFiles) {
      if (!file.notebookId) continue;
      const files = notebookFiles.get(file.notebookId) ?? [];
      files.push(file);
      notebookFiles.set(file.notebookId, files);
    }
    stats.notebooksFound = notebookFiles.size;
    // The source transaction has completed and its connection/deadline are released.
    // Destination writes are awaited directly; no source timeout can report early completion.
    for (const [notebookId, files] of notebookFiles) {
      try {
        const now = Date.now();
        const notebook: Omit<NotebookEntity, 'createdAt' | 'updatedAt'> = {
          id: notebookId,
          name: `Notebook ${notebookId.slice(0, 8)}`,
          description: `Migrated notebook with ${files.length} files`,
          lastAccessedAt: files.reduce(
            (latest, file) => Math.max(latest, file.lastAccessed || file.cachedAt || now),
            0
          ),
          accessCount: files.reduce((count, file) => Math.max(count, file.accessCount || 0), 0),
          fileCount: 0,
          totalSize: 0,
          cacheEnabled: true,
        };
        const imported = await persistenceService.notebooks.importNotebook(
          notebook,
          files.map((file) => ({
            notebookId: file.notebookId,
            filePath: file.path,
            fileName: file.name,
            content: file.content || '',
            lastModified: file.lastModified || new Date().toISOString(),
            size: file.size || 0,
          }))
        );
        if (imported > 0) stats.notebooksMigrated++;
        stats.filesMigrated += imported;
      } catch (error) {
        stats.errors.push(`Failed to migrate notebook ${notebookId}: ${error}`);
      }
    }
    stats.duration = Date.now() - stats.duration;
    return stats;
  }

  /** Retry historical imports without deleting or overwriting destination documents. */
  static forceMigration(): Promise<MigrationStats> {
    return this.migrate();
  }
}
