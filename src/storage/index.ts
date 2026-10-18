// storage/index.ts
// Main storage module exports

export * from './database';
export * from './schema';
export * from './fileTypes';
export * from './storageManager';
export * from './migration';
export * from './splitPreviewCache';
export * from './tabCache';

// Re-export main classes and functions for easy access
export { IndexedDBManager } from './database';
export { StorageManager, type CleanupStats, type StorageStats } from './storageManager';
export { DataMigration, type MigrationStats } from './migration';
export { getFileType, getActivePreviewMode, getMimeType } from './fileTypes';
export { SplitPreviewCache, type SplitFileData } from './splitPreviewCache';
export { TabCache, type TabState } from './tabCache';

// Legacy FileObject type for compatibility
export interface FileObject {
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

// Application file-cache API backed by the shared repository.
export const FileCache = {
  saveFile: async (fileData: any) => {
    const { persistenceService } = await import('../services/persistence/instance');

    // Transform legacy format to new format
    const transformedData = {
      notebookId: fileData.notebookId,
      filePath: fileData.path || fileData.filePath, // Support both legacy 'path' and new 'filePath'
      fileName: fileData.name || fileData.fileName, // Support both legacy 'name' and new 'fileName'
      content: fileData.content || '',
      lastModified: fileData.lastModified || new Date().toISOString(),
      size: fileData.size || 0,
      remoteUrl: fileData.remoteUrl,
    };

    // Ensure notebook exists before saving file
    try {
      const existingNotebook = await persistenceService.notebooks.getNotebook(
        transformedData.notebookId
      );

      if (!existingNotebook) {
        // Create new notebook if it doesn't exist
        await persistenceService.notebooks.saveNotebook({
          id: transformedData.notebookId,
          name: `Notebook ${transformedData.notebookId.slice(0, 8)}`, // Use first 8 chars as default name
          description: 'Auto-created notebook',
          lastAccessedAt: Date.now(),
          accessCount: 1,
          fileCount: 1,
          totalSize: transformedData.size,
          cacheEnabled: true,
        });
      } else {
        // Update existing notebook access time
        await persistenceService.notebooks.saveNotebook({
          ...existingNotebook,
          lastAccessedAt: Date.now(),
          accessCount: existingNotebook.accessCount + 1,
        });
      }
    } catch (error) {
      console.warn('Failed to ensure notebook exists:', error);
      // Continue with file save even if notebook creation fails
    }

    return persistenceService.files.saveFile(transformedData);
  },

  getFile: async (notebookId: string, filePath: string) => {
    const { persistenceService } = await import('../services/persistence/instance');
    const result = await persistenceService.files.getFile(notebookId, filePath);
    if (!result) return null;

    // Return legacy format
    return {
      id: result.metadata.id,
      notebookId: result.metadata.notebookId,
      path: result.metadata.filePath,
      name: result.metadata.fileName,
      content: result.content || '',
      type: result.metadata.fileType,
      lastModified: result.metadata.lastModified,
      size: result.metadata.size,
      cachedAt: result.metadata.cachedAt,
      accessCount: result.metadata.accessCount,
      lastAccessed: result.metadata.lastAccessedAt,
    };
  },

  deleteFile: async (notebookId: string, filePath: string) => {
    const { persistenceService } = await import('../services/persistence/instance');
    return persistenceService.files.deleteFile(notebookId, filePath);
  },

  getFilesForNotebook: async (notebookId: string) => {
    const { persistenceService } = await import('../services/persistence/instance');
    const results = await persistenceService.files.getFilesForNotebook(notebookId, true);

    // Return legacy format
    return results.map((result) => ({
      id: result.metadata.id,
      notebookId: result.metadata.notebookId,
      path: result.metadata.filePath,
      name: result.metadata.fileName,
      content: result.content || '',
      type: result.metadata.fileType,
      lastModified: result.metadata.lastModified,
      size: result.metadata.size,
      cachedAt: result.metadata.cachedAt,
      accessCount: result.metadata.accessCount,
      lastAccessed: result.metadata.lastAccessedAt,
    }));
  },

  clearNotebookCache: async (notebookId: string) => {
    const { StorageManager } = await import('./storageManager');
    return StorageManager.cleanupNotebook(notebookId);
  },

  // Get all cached notebooks
  getAllNotebooks: async () => {
    const { persistenceService } = await import('../services/persistence/instance');
    return persistenceService.notebooks.getAllNotebooks();
  },

  // Get specific notebook
  getNotebook: async (notebookId: string) => {
    const { persistenceService } = await import('../services/persistence/instance');
    return persistenceService.notebooks.getNotebook(notebookId);
  },
};

// Initialize storage system
export const initializeStorage = async (): Promise<void> => {
  const { StorageManager } = await import('./storageManager');
  await StorageManager.initialize();
};
