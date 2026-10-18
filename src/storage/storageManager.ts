// storage/storageManager.ts
// Main storage manager with cleanup and maintenance functionality

import { StorageMaintenanceLifecycle } from './StorageMaintenanceLifecycle';
import { persistenceService } from '../services/persistence/instance';
import { StorageConfigEntity, DEFAULT_STORAGE_CONFIG, NotebookEntity } from './schema';
import { DataMigration } from './migration';
import { storageLog } from '@Utils/logger';

/**
 * Storage cleanup statistics
 */
export interface CleanupStats {
  notebooksDeleted: number;
  filesDeleted: number;
  bytesFreed: number;
  duration: number;
}

/**
 * Storage usage statistics
 */
export interface StorageStats {
  totalNotebooks: number;
  totalFiles: number;
  totalSize: number;
  largeFilesCount: number;
  oldestNotebook: number;
  newestNotebook: number;
  mostAccessedNotebook: string;
}

/**
 * Main storage manager with intelligent cleanup and maintenance
 */
export class StorageManager {
  private static cleanupInProgress = false;
  private static readonly lifecycle = new StorageMaintenanceLifecycle({
    initialize: () => StorageManager.doInitialize(),
    close: () => persistenceService.close(),
    maintain: () => StorageManager.performScheduledCleanup(),
    onError: (error) => storageLog.error('Scheduled cleanup failed', { error }),
  });

  static initialize(): Promise<void> {
    return this.lifecycle.initialize();
  }

  static getConfig(): Promise<StorageConfigEntity> {
    return this.lifecycle.run(() => this.doGetConfig());
  }

  static updateConfig(config: Partial<StorageConfigEntity>): Promise<void> {
    return this.lifecycle.run(() => this.doUpdateConfig(config));
  }

  static getStorageStats(): Promise<StorageStats> {
    return this.lifecycle.run(() => this.doGetStorageStats());
  }

  static cleanupStorage(force = false): Promise<CleanupStats> {
    return this.lifecycle.run(() => this.doCleanupStorage(force));
  }

  static cleanupNotebook(notebookId: string): Promise<boolean> {
    return this.lifecycle.run(() => this.doCleanupNotebook(notebookId));
  }

  static getCleanupCandidates(): Promise<{
    inactive: NotebookEntity[];
    excess: NotebookEntity[];
    totalBytesToFree: number;
  }> {
    return this.lifecycle.run(() => this.doGetCleanupCandidates());
  }

  static emergencyCleanup(): Promise<CleanupStats> {
    return this.lifecycle.run(() => this.doEmergencyCleanup());
  }

  static forceMigration(): Promise<void> {
    return this.lifecycle.run(() => this.doForceMigration());
  }

  /**
   * Internal initialization method
   */
  private static async doInitialize(): Promise<void> {
    try {
      storageLog.info('Initializing storage system');
      await persistenceService.initialize();
      storageLog.persistence('IndexedDB', 'init', { success: true });

      await this.ensureConfig();
      storageLog.info('Storage configuration initialized');

      // Check and perform data migration if needed
      await this.checkAndMigrate();

      storageLog.info('Storage system initialization completed');
    } catch (error) {
      storageLog.error('Storage system initialization failed', { error });
      throw error;
    }
  }

  /**
   * Get storage configuration
   */
  private static async doGetConfig(): Promise<StorageConfigEntity> {
    try {
      return await persistenceService.maintenance.getConfig();
    } catch (error) {
      storageLog.warn('Failed to read storage configuration, using defaults', { error });
      return { ...DEFAULT_STORAGE_CONFIG };
    }
  }

  private static async doUpdateConfig(config: Partial<StorageConfigEntity>): Promise<void> {
    await persistenceService.maintenance.updateConfig(config);
  }

  /**
   * Get comprehensive storage statistics
   */
  private static async doGetStorageStats(): Promise<StorageStats> {
    const notebooks = await persistenceService.notebooks.getAllNotebooks();

    let totalFiles = 0;
    let totalSize = 0;
    let largeFilesCount = 0;
    let oldestNotebook = Date.now();
    let newestNotebook = 0;
    let mostAccessedNotebook = '';
    let maxAccess = 0;

    for (const notebook of notebooks) {
      const stats = await persistenceService.notebooks.getNotebookStats(notebook.id);
      totalFiles += stats.fileCount;
      totalSize += stats.totalSize;

      // Get large files count for this notebook
      const largeFiles = await persistenceService.files.getLargeFiles(notebook.id);
      largeFilesCount += largeFiles.length;

      // Track oldest/newest
      oldestNotebook = Math.min(oldestNotebook, notebook.createdAt);
      newestNotebook = Math.max(newestNotebook, notebook.createdAt);

      // Track most accessed
      if (notebook.accessCount > maxAccess) {
        maxAccess = notebook.accessCount;
        mostAccessedNotebook = notebook.id;
      }
    }

    return {
      totalNotebooks: notebooks.length,
      totalFiles,
      totalSize,
      largeFilesCount,
      oldestNotebook,
      newestNotebook,
      mostAccessedNotebook,
    };
  }

  /**
   * Clean up old and unused notebooks and files
   */
  private static async doCleanupStorage(force = false): Promise<CleanupStats> {
    if (this.cleanupInProgress && !force) {
      throw new Error('Cleanup already in progress');
    }

    this.cleanupInProgress = true;
    const startTime = Date.now();

    try {
      const config = await persistenceService.maintenance.getConfig();
      const stats: CleanupStats = {
        notebooksDeleted: 0,
        filesDeleted: 0,
        bytesFreed: 0,
        duration: 0,
      };

      // 1. Clean up inactive notebooks
      const inactiveNotebooks = await persistenceService.notebooks.getInactiveNotebooks(
        config.retentionPeriod
      );

      for (const notebook of inactiveNotebooks) {
        // Get files for size calculation
        const files = await persistenceService.files.getFilesForNotebook(notebook.id);
        const notebookSize = files.reduce((sum, file) => sum + file.metadata.size, 0);

        // Delete notebook and all associated data
        const deleted = await persistenceService.notebooks.deleteNotebook(notebook.id);
        if (deleted) {
          stats.notebooksDeleted++;
          stats.filesDeleted += files.length;
          stats.bytesFreed += notebookSize;
        }
      }

      // 2. Enforce maximum notebook limit
      const allNotebooks = await persistenceService.notebooks.getAllNotebooks({
        orderBy: 'lastAccessedAt',
        limit: config.maxNotebooks + 50, // Get more than limit to find candidates for deletion
      });

      if (allNotebooks.length > config.maxNotebooks) {
        const excessNotebooks = allNotebooks.slice(config.maxNotebooks);

        for (const notebook of excessNotebooks) {
          const files = await persistenceService.files.getFilesForNotebook(notebook.id);
          const notebookSize = files.reduce((sum, file) => sum + file.metadata.size, 0);

          const deleted = await persistenceService.notebooks.deleteNotebook(notebook.id);
          if (deleted) {
            stats.notebooksDeleted++;
            stats.filesDeleted += files.length;
            stats.bytesFreed += notebookSize;
          }
        }
      }

      // 3. Clean up orphaned activities (older than retention period)
      await this.cleanupOldActivities(config.retentionPeriod);

      // 4. Update config with last cleanup time
      await this.doUpdateConfig({ lastCleanup: Date.now() });

      stats.duration = Date.now() - startTime;

      return stats;
    } finally {
      this.cleanupInProgress = false;
    }
  }

  /**
   * Clean up specific notebook and all its data
   */
  private static async doCleanupNotebook(notebookId: string): Promise<boolean> {
    try {
      // Get files for size calculation
      const files = await persistenceService.files.getFilesForNotebook(notebookId);
      const totalSize = files.reduce((sum, file) => sum + file.metadata.size, 0);

      // Delete notebook and all associated data
      const deleted = await persistenceService.notebooks.deleteNotebook(notebookId);

      if (deleted) {
        storageLog.info('Cleaned up notebook', {
          notebookId,
          filesCount: files.length,
          bytesFreed: totalSize,
        });
      }

      return deleted;
    } catch (error) {
      storageLog.error('Failed to cleanup notebook', { notebookId, error });
      return false;
    }
  }

  /**
   * Get notebooks ready for cleanup (inactive or exceeding limits)
   */
  private static async doGetCleanupCandidates(): Promise<{
    inactive: NotebookEntity[];
    excess: NotebookEntity[];
    totalBytesToFree: number;
  }> {
    const config = await persistenceService.maintenance.getConfig();

    // Get inactive notebooks
    const inactive = await persistenceService.notebooks.getInactiveNotebooks(
      config.retentionPeriod
    );

    // Get excess notebooks (over the limit)
    const allNotebooks = await persistenceService.notebooks.getAllNotebooks({
      orderBy: 'lastAccessedAt',
    });

    const excess =
      allNotebooks.length > config.maxNotebooks ? allNotebooks.slice(config.maxNotebooks) : [];

    // Calculate total bytes to free
    let totalBytesToFree = 0;

    for (const notebook of [...inactive, ...excess]) {
      const stats = await persistenceService.notebooks.getNotebookStats(notebook.id);
      totalBytesToFree += stats.totalSize;
    }

    return {
      inactive,
      excess,
      totalBytesToFree,
    };
  }

  /**
   * Emergency cleanup when storage is full
   */
  private static async doEmergencyCleanup(): Promise<CleanupStats> {
    storageLog.warn('Performing emergency storage cleanup');

    const config = await persistenceService.maintenance.getConfig();
    const stats: CleanupStats = {
      notebooksDeleted: 0,
      filesDeleted: 0,
      bytesFreed: 0,
      duration: Date.now(),
    };

    // Get all notebooks ordered by last access (oldest first)
    const notebooks = await persistenceService.notebooks.getAllNotebooks({
      orderBy: 'lastAccessedAt',
    });

    // Delete oldest notebooks until we're under limits
    const targetNotebooks = Math.floor(config.maxNotebooks * 0.7); // Keep only 70%

    if (notebooks.length > targetNotebooks) {
      const notebooksToDelete = notebooks.slice(0, notebooks.length - targetNotebooks);

      for (const notebook of notebooksToDelete) {
        const files = await persistenceService.files.getFilesForNotebook(notebook.id);
        const notebookSize = files.reduce((sum, file) => sum + file.metadata.size, 0);

        const deleted = await persistenceService.notebooks.deleteNotebook(notebook.id);
        if (deleted) {
          stats.notebooksDeleted++;
          stats.filesDeleted += files.length;
          stats.bytesFreed += notebookSize;
        }
      }
    }

    stats.duration = Date.now() - stats.duration;

    return stats;
  }

  private static async performScheduledCleanup(): Promise<void> {
    // Maintenance must not delete data using fallback settings after a read failure.
    const config = await persistenceService.maintenance.getConfig();
    if (Date.now() - (config.lastCleanup || 0) >= config.cleanupInterval) {
      const stats = await this.doCleanupStorage();
      storageLog.info('Cleanup completed', { ...stats });
    }
  }

  /**
   * Ensure config exists in database
   */
  private static async ensureConfig(): Promise<void> {
    await persistenceService.maintenance.ensureConfig();
  }

  private static async cleanupOldActivities(retentionPeriod: number): Promise<void> {
    await persistenceService.maintenance.cleanupActivities(retentionPeriod);
  }

  /**
   * Check and perform data migration if needed
   */
  private static async checkAndMigrate(): Promise<void> {
    try {
      storageLog.debug('Checking if data migration is needed');
      const migrationNeeded = await DataMigration.isMigrationNeeded();

      if (migrationNeeded) {
        storageLog.info('Data migration required, starting migration');
        const stats = await DataMigration.migrate();

        if (stats.notebooksMigrated > 0 || stats.filesMigrated > 0) {
          storageLog.info('Data migration completed successfully', {
            notebooks: stats.notebooksMigrated,
            files: stats.filesMigrated,
            duration: stats.duration,
          });
        }

        if (stats.errors.length > 0) {
          storageLog.warn('Migration completed with errors', { errors: stats.errors });
        }
      } else {
        storageLog.debug('No data migration needed');
      }
    } catch (error) {
      storageLog.error('Data migration failed', { error });
      // Don't throw - we can continue without migration
    }
  }

  /**
   * Force data migration (useful for debugging)
   */
  private static async doForceMigration(): Promise<void> {
    try {
      storageLog.info('Forcing data migration');
      const stats = await DataMigration.forceMigration();
      storageLog.info('Force migration completed', { stats });
    } catch (error) {
      storageLog.error('Force migration failed', { error });
      throw error;
    }
  }

  /**
   * Close storage system
   */
  static async close(): Promise<void> {
    await this.lifecycle.close();
  }
}
