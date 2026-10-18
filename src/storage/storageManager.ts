// storage/storageManager.ts
// Main storage manager with cleanup and maintenance functionality

import { StorageMaintenanceLifecycle } from './StorageMaintenanceLifecycle';
import { persistenceService } from '../services/persistence/instance';
import { StorageConfigEntity, DEFAULT_STORAGE_CONFIG, NotebookEntity } from './schema';
import { DataMigration } from './migration';
import { storageLog } from '@Utils/logger';

export type { CleanupStats } from './NotebookRetentionPolicy';
import type { CleanupStats, CleanupMode } from './NotebookRetentionPolicy';

export type { StorageStats } from './StorageUsage';
import type { StorageStats } from './StorageUsage';

/**
 * Main storage manager with intelligent cleanup and maintenance
 */
export class StorageManager {
  private static readonly cleanupRequests = new Set<Promise<CleanupStats>>();
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
    return persistenceService.maintenance.getStorageStats();
  }

  /**
   * Clean up old and unused notebooks and files
   */
  private static async doCleanupStorage(force = false): Promise<CleanupStats> {
    return this.performCleanup('regular', force);
  }

  private static async performCleanup(mode: CleanupMode, force: boolean): Promise<CleanupStats> {
    if (this.cleanupRequests.size > 0 && !force) throw new Error('Cleanup already in progress');
    const request = persistenceService.maintenance.cleanup(mode);
    this.cleanupRequests.add(request);
    try {
      return await request;
    } finally {
      this.cleanupRequests.delete(request);
    }
  }

  /**
   * Clean up specific notebook and all its data
   */
  private static async doCleanupNotebook(notebookId: string): Promise<boolean> {
    try {
      const deleted = await persistenceService.notebooks.deleteNotebook(notebookId);
      if (deleted) storageLog.info('Cleaned up notebook', { notebookId });

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
    return persistenceService.maintenance.getCleanupCandidates();
  }

  private static async doEmergencyCleanup(): Promise<CleanupStats> {
    return this.performCleanup('emergency', true);
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
