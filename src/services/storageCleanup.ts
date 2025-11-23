// services/storageCleanup.ts
// Cleanup utility for old cell files and storage migration

import type { IPersistenceService } from './persistence/interfaces';

/**
 * Storage cleanup utility for migrating from multi-file to single-file notebook storage
 */
export class StorageCleanup {
  /**
   * Clean up old cell files for a specific notebook
   */
  static async cleanupNotebookCellFiles(
    persistence: IPersistenceService,
    notebookId: string
  ): Promise<number> {
    try {
      console.log(`🧹 Cleaning up old cell files for notebook ${notebookId}...`);

      // Get all files for this notebook
      const files = await persistence.files.getFilesForNotebook(notebookId, true);

      let deletedCount = 0;

      for (const file of files) {
        const { filePath, fileName } = file.metadata;

        // Delete old cell files (files in cells/ directory)
        if (filePath.startsWith('cells/')) {
          try {
            await persistence.files.deleteFile(notebookId, filePath);
            console.log(`  📁 Deleted old cell file: ${fileName}`);
            deletedCount++;
          } catch (error) {
            console.warn(`  ⚠️ Failed to delete ${fileName}:`, error);
          }
        }
      }

      console.log(`✅ Cleaned up ${deletedCount} old cell files for notebook ${notebookId}`);
      return deletedCount;
    } catch (error) {
      console.error(`❌ Failed to cleanup notebook ${notebookId}:`, error);
      return 0;
    }
  }

  /**
   * Clean up old cell files for all notebooks
   */
  static async cleanupAllNotebookCellFiles(
    persistence: IPersistenceService
  ): Promise<{ cleaned: number; errors: number }> {
    try {
      console.log(`🧹 Starting cleanup of all old cell files...`);

      // Get all notebooks
      const notebooks = await persistence.notebooks.getAllNotebooks();

      let totalCleaned = 0;
      let totalErrors = 0;

      for (const notebook of notebooks) {
        try {
          const cleaned = await this.cleanupNotebookCellFiles(persistence, notebook.id);
          totalCleaned += cleaned;
        } catch (error) {
          console.error(`Failed to cleanup notebook ${notebook.id}:`, error);
          totalErrors++;
        }
      }

      console.log(`✅ Cleanup complete: ${totalCleaned} files cleaned, ${totalErrors} errors`);
      return { cleaned: totalCleaned, errors: totalErrors };
    } catch (error) {
      console.error('❌ Failed to run cleanup:', error);
      return { cleaned: 0, errors: 1 };
    }
  }

  /**
   * Get statistics about old cell files
   */
  static async getCellFileStatistics(persistence: IPersistenceService): Promise<{
    notebooksWithCellFiles: number;
    totalCellFiles: number;
    totalSizeKB: number;
  }> {
    try {
      console.log('📊 Gathering cell file statistics...');

      const notebooks = await persistence.notebooks.getAllNotebooks();

      let notebooksWithCellFiles = 0;
      let totalCellFiles = 0;
      let totalSizeBytes = 0;

      for (const notebook of notebooks) {
        const files = await persistence.files.getFilesForNotebook(notebook.id, true);

        const cellFiles = files.filter((file) => file.metadata.filePath.startsWith('cells/'));

        if (cellFiles.length > 0) {
          notebooksWithCellFiles++;
          totalCellFiles += cellFiles.length;

          for (const file of cellFiles) {
            totalSizeBytes += file.metadata.size || 0;
          }
        }
      }

      const stats = {
        notebooksWithCellFiles,
        totalCellFiles,
        totalSizeKB: Math.round(totalSizeBytes / 1024),
      };

      console.log('📊 Cell file statistics:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Failed to get statistics:', error);
      return { notebooksWithCellFiles: 0, totalCellFiles: 0, totalSizeKB: 0 };
    }
  }

  /**
   * Check if a notebook has old cell files
   */
  static async hasOldCellFiles(
    persistence: IPersistenceService,
    notebookId: string
  ): Promise<boolean> {
    try {
      const files = await persistence.files.getFilesForNotebook(notebookId, true);
      return files.some((file) => file.metadata.filePath.startsWith('cells/'));
    } catch (error) {
      console.warn(`Failed to check cell files for ${notebookId}:`, error);
      return false;
    }
  }

  /**
   * Migrate a notebook from multi-file to single-file format
   */
  static async migrateNotebook(
    persistence: IPersistenceService,
    notebookId: string
  ): Promise<boolean> {
    try {
      console.log(`🔄 Migrating notebook ${notebookId} to single-file format...`);

      // Check if already has main notebook file
      const mainFile = await persistence.files.getFile(notebookId, `notebook_${notebookId}.json`);

      if (mainFile) {
        console.log(`  ✅ Notebook ${notebookId} already has main file, just cleaning up cells...`);
        await this.cleanupNotebookCellFiles(persistence, notebookId);
        return true;
      }

      // Try to reconstruct from cell files if main file is missing
      const files = await persistence.files.getFilesForNotebook(notebookId, true);
      const cellFiles = files.filter((file) => file.metadata.filePath.startsWith('cells/'));

      if (cellFiles.length > 0) {
        console.log(`  🔧 Reconstructing from ${cellFiles.length} cell files...`);

        // This would need to be implemented if we want to reconstruct
        // For now, just clean up the cell files
        await this.cleanupNotebookCellFiles(persistence, notebookId);
        console.log(`  ⚠️ Could not reconstruct main file, cleaned up cell files`);
        return false;
      }

      console.log(`  ✅ No migration needed for notebook ${notebookId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to migrate notebook ${notebookId}:`, error);
      return false;
    }
  }
}

// Export for use in components
export default StorageCleanup;
