// storage/index.ts
// Main storage module exports

export * from './database';
export * from './schema';
export * from './fileTypes';
export * from './notebookOrm';
export * from './fileOrm';
export * from './storageManager';
export * from './migration';
export * from './splitPreviewCache';
export * from './tabCache';

// Re-export main classes and functions for easy access
export { IndexedDBManager } from './database';
export { NotebookORM } from './notebookOrm';
export { FileORM, type FileData, type FileResult } from './fileOrm';
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

// Legacy compatibility - map old FileCache to new FileORM
export const FileCache = {
  saveFile: async (fileData: any) => {
    const { FileORM } = await import('./fileOrm');
    const { NotebookORM } = await import('./notebookOrm');
    
    // Transform legacy format to new format
    const transformedData = {
      notebookId: fileData.notebookId,
      filePath: fileData.path || fileData.filePath, // Support both legacy 'path' and new 'filePath'
      fileName: fileData.name || fileData.fileName, // Support both legacy 'name' and new 'fileName'
      content: fileData.content || '',
      lastModified: fileData.lastModified || new Date().toISOString(),
      size: fileData.size || 0,
      remoteUrl: fileData.remoteUrl
    };
    
    // Ensure notebook exists before saving file
    try {
      const existingNotebook = await NotebookORM.getNotebook(transformedData.notebookId);
      
      if (!existingNotebook) {
        // Create new notebook if it doesn't exist
        await NotebookORM.saveNotebook({
          id: transformedData.notebookId,
          name: `Notebook ${transformedData.notebookId.slice(0, 8)}`, // Use first 8 chars as default name
          description: 'Auto-created notebook',
          lastAccessedAt: Date.now(),
          accessCount: 1,
          fileCount: 1,
          totalSize: transformedData.size,
          cacheEnabled: true
        });
      } else {
        // Update existing notebook access time
        await NotebookORM.saveNotebook({
          ...existingNotebook,
          lastAccessedAt: Date.now(),
          accessCount: existingNotebook.accessCount + 1
        });
      }
    } catch (error) {
      console.warn('Failed to ensure notebook exists:', error);
      // Continue with file save even if notebook creation fails
    }
    
    return FileORM.saveFile(transformedData);
  },
  
  getFile: async (notebookId: string, filePath: string) => {
    const { FileORM } = await import('./fileOrm');
    const result = await FileORM.getFile(notebookId, filePath);
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
      lastAccessed: result.metadata.lastAccessedAt
    };
  },
  
  deleteFile: async (notebookId: string, filePath: string) => {
    const { FileORM } = await import('./fileOrm');
    return FileORM.deleteFile(notebookId, filePath);
  },
  
  getFilesForNotebook: async (notebookId: string) => {
    const { FileORM } = await import('./fileOrm');
    const results = await FileORM.getFilesForNotebook(notebookId, true);
    
    // Return legacy format
    return results.map(result => ({
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
      lastAccessed: result.metadata.lastAccessedAt
    }));
  },
  
  clearNotebookCache: async (notebookId: string) => {
    const { StorageManager } = await import('./storageManager');
    return StorageManager.cleanupNotebook(notebookId);
  },

  // Get all cached notebooks
  getAllNotebooks: async () => {
    const { NotebookORM } = await import('./notebookOrm');
    return NotebookORM.getNotebooks();
  },

  // Get specific notebook
  getNotebook: async (notebookId: string) => {
    const { NotebookORM } = await import('./notebookOrm');
    return NotebookORM.getNotebook(notebookId);
  }
};

// Initialize storage system
export const initializeStorage = async (): Promise<void> => {
  const { StorageManager } = await import('./storageManager');
  await StorageManager.initialize();
};