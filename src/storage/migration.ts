// storage/migration.ts
// Data migration from legacy storage systems

import { persistenceService } from '../services/persistence/instance';
import { LegacyMigrationPlan } from './LegacyMigrationPlan';
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
    const plan = new LegacyMigrationPlan(legacyFiles);
    stats.filesFound = plan.filesFound;
    stats.notebooksFound = plan.notebooksFound;
    stats.errors.push(...plan.errors.map((error) => `${dbName}: ${error}`));
    // Source data is detached and validated before each atomic destination batch.
    for (const { notebook, files } of plan.batches) {
      try {
        const imported = await persistenceService.notebooks.importNotebook(notebook, files, dbName);
        if (imported > 0) stats.notebooksMigrated++;
        stats.filesMigrated += imported;
      } catch (error) {
        stats.errors.push(`Failed to migrate notebook ${notebook.id} from ${dbName}: ${error}`);
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
