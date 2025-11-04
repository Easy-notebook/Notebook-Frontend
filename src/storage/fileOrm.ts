// storage/fileOrm.ts
// File ORM with support for soft references and large file handling

import { IndexedDBManager, DB_CONFIG } from './database';
import { FileMetadataEntity, FileContentEntity, DEFAULT_STORAGE_CONFIG } from './schema';
import { NotebookORM } from './notebookOrm';
import { getFileType } from './fileTypes';
import { fileLog, storageLog } from '../utils/logger';

/**
 * File storage configuration
 */
interface FileStorageOptions {
  maxFileSize?: number; // Files larger than this use soft references
  compressionEnabled?: boolean;
  forceLocal?: boolean; // Force local storage even for large files
}

/**
 * File data for storage
 */
export interface FileData {
  notebookId: string;
  filePath: string;
  fileName: string;
  content: string;
  lastModified: string;
  size: number;
  remoteUrl?: string;
}

/**
 * File retrieval result
 */
export interface FileResult {
  metadata: FileMetadataEntity;
  content?: string; // Only present if locally stored
  needsRemoteFetch?: boolean; // True if content needs to be fetched from backend
}

/**
 * File ORM for managing files with smart storage strategy
 */
export class FileORM {
  private static defaultConfig = DEFAULT_STORAGE_CONFIG;
  
  /**
   * Save file with intelligent storage strategy
   */
  static async saveFile(fileData: FileData, options: FileStorageOptions = {}): Promise<FileMetadataEntity> {
    // Validate required fields
    if (!fileData.notebookId || !fileData.filePath || !fileData.fileName) {
      throw new Error(`Invalid file data: missing required fields. Got notebookId=${fileData.notebookId}, filePath=${fileData.filePath}, fileName=${fileData.fileName}`);
    }
    
    const db = await IndexedDBManager.getDB();
    const now = Date.now();
    
    const config = {
      maxFileSize: options.maxFileSize ?? this.defaultConfig.maxFileSize,
      compressionEnabled: options.compressionEnabled ?? this.defaultConfig.compressionEnabled,
      forceLocal: options.forceLocal ?? false
    };
    
    const fileId = `${fileData.notebookId}::${fileData.filePath}`;
    const isLargeFile = fileData.size > config.maxFileSize && !config.forceLocal;
    
    // Create file metadata
    const metadata: FileMetadataEntity = {
      id: fileId,
      notebookId: fileData.notebookId,
      filePath: fileData.filePath,
      fileName: fileData.fileName,
      fileType: getFileType(fileData.filePath),
      size: fileData.size,
      lastModified: fileData.lastModified,
      cachedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      storageType: isLargeFile ? 'remote' : 'local',
      hasLocalContent: !isLargeFile,
      remoteUrl: fileData.remoteUrl,
      isLargeFile,
      contentPreview: isLargeFile ? this.generateContentPreview(fileData.content) : undefined
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        DB_CONFIG.STORES.FILES_METADATA,
        DB_CONFIG.STORES.FILES_CONTENT
      ], 'readwrite');
      
      const metaStore = transaction.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      const contentStore = transaction.objectStore(DB_CONFIG.STORES.FILES_CONTENT);
      
      // Check if file already exists to compute notebook deltas
      const getExistingReq = metaStore.get(fileId);
      getExistingReq.onsuccess = () => {
        const existing = getExistingReq.result as FileMetadataEntity | undefined;
        const deltaFileCount = existing ? 0 : 1;
        const deltaBytes = metadata.size - (existing?.size || 0);

        // Save metadata
        const metaRequest = metaStore.put(metadata);

        metaRequest.onsuccess = () => {
          // Save content only if not a large file
          if (!isLargeFile) {
            const content: FileContentEntity = {
              fileId,
              content: config.compressionEnabled ? this.compressContent(fileData.content) : fileData.content,
              compressed: config.compressionEnabled,
              encoding: this.detectEncoding(fileData.content)
            };

            const contentRequest = contentStore.put(content);

            contentRequest.onsuccess = () => {
              fileLog.fileOperation('save', fileData.filePath, {
                notebookId: fileData.notebookId,
                size: fileData.content.length,
                compressed: config.compressionEnabled,
                storageType: metadata.storageType,
                hasLocalContent: metadata.hasLocalContent
              });
              
              // Log activity and resolve
              NotebookORM.logActivity(fileData.notebookId, 'file_create', fileData.filePath)
                .catch(error => storageLog.error('Failed to log file create activity', { error }));
              // Adjust notebook stats
              NotebookORM.adjustNotebookStats(fileData.notebookId, deltaFileCount, deltaBytes)
                .catch(error => storageLog.error('Failed to adjust notebook stats', { error }));
              resolve(metadata);
            };

            contentRequest.onerror = () => reject(contentRequest.error);
          } else {
            // Large file - only metadata is saved
            NotebookORM.logActivity(fileData.notebookId, 'file_create', fileData.filePath, {
              isLargeFile: true,
              remoteUrl: fileData.remoteUrl
            }).catch(error => storageLog.error('Failed to log large file create activity', { error }));
            // Adjust notebook stats
            NotebookORM.adjustNotebookStats(fileData.notebookId, deltaFileCount, deltaBytes)
              .catch(error => storageLog.error('Failed to adjust notebook stats for large file', { error }));
            resolve(metadata);
          }
        };

        metaRequest.onerror = () => reject(metaRequest.error);
      };
      getExistingReq.onerror = () => reject(getExistingReq.error);

      transaction.onerror = () => reject(transaction.error);

      // Increase timeout for slower systems
      const timeoutId = setTimeout(() => {
        fileLog.warn('Save file timeout', {
          notebookId: fileData.notebookId,
          filePath: fileData.filePath,
          timeoutMs: 20000
        });
        reject(new Error('Save file timeout - operation took longer than 20 seconds'));
      }, 20000); // Increased from 10s to 20s
      
      // Add timeout cleanup to success/error handlers
      const originalResolve = resolve;
      const originalReject = reject;
      resolve = (value) => { clearTimeout(timeoutId); originalResolve(value); };
      reject = (error) => { clearTimeout(timeoutId); originalReject(error); };
    });
  }
  
  /**
   * Get file by notebook ID and file path
   */
  static async getFile(notebookId: string, filePath: string): Promise<FileResult | null> {
    // Validate required parameters
    if (!notebookId || !filePath) {
      fileLog.warn('Invalid parameters for getFile', { notebookId, filePath });
      return null;
    }
    
    const db = await IndexedDBManager.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        DB_CONFIG.STORES.FILES_METADATA,
        DB_CONFIG.STORES.FILES_CONTENT
      ], 'readwrite');
      
      const metaStore = transaction.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      const index = metaStore.index('notebookPath');
      
      const metaRequest = index.get([notebookId, filePath]);
      
      metaRequest.onsuccess = () => {
        const metadata = metaRequest.result as FileMetadataEntity | undefined;
        
        if (!metadata) {
          resolve(null);
          return;
        }
        
        // Update access statistics
        const updatedMetadata: FileMetadataEntity = {
          ...metadata,
          lastAccessedAt: Date.now(),
          accessCount: metadata.accessCount + 1
        };
        
        const updateRequest = metaStore.put(updatedMetadata);
        updateRequest.onsuccess = () => {
          // Log activity and update notebook access
          NotebookORM.logActivity(notebookId, 'file_access', filePath)
            .catch(error => storageLog.error('Failed to log file access activity', { error }));
          NotebookORM.updateNotebookAccess(notebookId)
            .catch(error => storageLog.error('Failed to update notebook access', { error }));
        };
        updateRequest.onerror = () => fileLog.error('Failed to update file access stats', { notebookId, filePath });
        
        if (metadata.hasLocalContent) {
          // Get content from local storage
          const contentStore = transaction.objectStore(DB_CONFIG.STORES.FILES_CONTENT);
          const contentRequest = contentStore.get(metadata.id);
          
          contentRequest.onsuccess = () => {
            clearTimeout(timeoutId);
            const contentEntity = contentRequest.result as FileContentEntity | undefined;
            
            fileLog.debug('Retrieved file content', {
              fileId: metadata.id,
              found: !!contentEntity,
              compressed: contentEntity?.compressed,
              rawContentSize: contentEntity?.content?.length || 0,
              encoding: contentEntity?.encoding
            });
            
            const result: FileResult = {
              metadata: updatedMetadata,
              content: contentEntity ? this.decompressContent(contentEntity.content, contentEntity.compressed) : undefined
            };
            
            if (result.content) {
              fileLog.debug('Decompressed content size', { size: result.content.length });
            }
            
            resolve(result);
          };
          
          contentRequest.onerror = () => {
            clearTimeout(timeoutId);
            // Content not found locally, mark for remote fetch
            resolve({
              metadata: updatedMetadata,
              needsRemoteFetch: true
            });
          };
        } else {
          clearTimeout(timeoutId);
          // Large file - needs remote fetch
          resolve({
            metadata: updatedMetadata,
            needsRemoteFetch: true
          });
        }
      };
      
      metaRequest.onerror = () => {
        clearTimeout(timeoutId);
        reject(metaRequest.error);
      };
      
      // Increase timeout for slower systems
      const timeoutId = setTimeout(() => {
        fileLog.warn('File retrieval timeout - consider optimizing database', {
          notebookId,
          filePath,
          timeoutMs: 15000
        });
        reject(new Error('Get file timeout - operation took longer than 15 seconds'));
      }, 15000); // Increased from 5s to 15s
    });
  }
  
  /**
   * Get all files for a notebook
   */
  static async getFilesForNotebook(notebookId: string, includeContent: boolean = false): Promise<FileResult[]> {
    const db = await IndexedDBManager.getDB();
    // Update notebook access on listing files
    NotebookORM.updateNotebookAccess(notebookId)
      .catch(error => storageLog.error('Failed to update notebook access during file listing', { error }));

    return new Promise((resolve, reject) => {
      const storeNames = includeContent 
        ? [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.FILES_CONTENT]
        : [DB_CONFIG.STORES.FILES_METADATA];
        
      const transaction = db.transaction(storeNames, 'readonly');
      const metaStore = transaction.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      const index = metaStore.index('notebookId');
      
      const request = index.openCursor(notebookId);
      const files: FileResult[] = [];
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const metadata = cursor.value as FileMetadataEntity;
          
          if (includeContent && metadata.hasLocalContent) {
            // Get content
            const contentStore = transaction.objectStore(DB_CONFIG.STORES.FILES_CONTENT);
            const contentRequest = contentStore.get(metadata.id);
            
            contentRequest.onsuccess = () => {
              const contentEntity = contentRequest.result as FileContentEntity | undefined;
              files.push({
                metadata,
                content: contentEntity ? this.decompressContent(contentEntity.content, contentEntity.compressed) : undefined,
                needsRemoteFetch: !contentEntity
              });
              
              cursor.continue();
            };
            
            contentRequest.onerror = () => {
              files.push({
                metadata,
                needsRemoteFetch: true
              });
              cursor.continue();
            };
          } else {
            files.push({
              metadata,
              needsRemoteFetch: !metadata.hasLocalContent
            });
            cursor.continue();
          }
        } else {
          resolve(files);
        }
      };
      
      request.onerror = () => reject(request.error);
      
      // Increase timeout for slower systems
      const timeoutId = setTimeout(() => {
        fileLog.warn('Get files timeout for notebook', {
          notebookId,
          includeContent,
          timeoutMs: 20000
        });
        reject(new Error('Get files timeout - operation took longer than 20 seconds'));
      }, 20000); // Increased from 8s to 20s
      
      // Add timeout cleanup to success/error handlers
      const originalResolve = resolve;
      const originalReject = reject;
      resolve = (value) => { clearTimeout(timeoutId); originalResolve(value); };
      reject = (error) => { clearTimeout(timeoutId); originalReject(error); };
    });
  }
  
  /**
   * Delete file
   */
  static async deleteFile(notebookId: string, filePath: string): Promise<boolean> {
    // Validate required parameters
    if (!notebookId || !filePath) {
      fileLog.warn('Invalid parameters for deleteFile', { notebookId, filePath });
      return false;
    }
    
    const db = await IndexedDBManager.getDB();
    const fileId = `${notebookId}::${filePath}`;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        DB_CONFIG.STORES.FILES_METADATA,
        DB_CONFIG.STORES.FILES_CONTENT
      ], 'readwrite');
      
      const metaStore = transaction.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      const contentStore = transaction.objectStore(DB_CONFIG.STORES.FILES_CONTENT);

      // First get existing metadata to compute deltas
      const getMetaReq = metaStore.get(fileId);
      getMetaReq.onsuccess = () => {
        const existing = getMetaReq.result as FileMetadataEntity | undefined;
        if (!existing) {
          // Nothing to delete
          resolve(true);
          return;
        }
        const size = existing.size || 0;

        // Delete metadata
        const metaRequest = metaStore.delete(fileId);

        metaRequest.onsuccess = () => {
          // Delete content
          const contentRequest = contentStore.delete(fileId);

          const finalize = () => {
            NotebookORM.logActivity(notebookId, 'file_delete', filePath)
              .catch(error => storageLog.error('Failed to log file delete activity', { error }));
            // Adjust notebook stats
            NotebookORM.adjustNotebookStats(notebookId, -1, -size)
              .catch(error => storageLog.error('Failed to adjust notebook stats after delete', { error }));
            resolve(true);
          };

          contentRequest.onsuccess = finalize;
          contentRequest.onerror = finalize; // Content might not exist (large file)
        };

        metaRequest.onerror = () => reject(metaRequest.error);
      };
      getMetaReq.onerror = () => reject(getMetaReq.error);
      
      // Increase timeout for slower systems
      const timeoutId = setTimeout(() => {
        fileLog.warn('Delete file timeout', {
          notebookId,
          filePath,
          timeoutMs: 15000
        });
        reject(new Error('Delete file timeout - operation took longer than 15 seconds'));
      }, 15000); // Increased from 5s to 15s
      
      // Add timeout cleanup to success/error handlers
      const originalResolve = resolve;
      const originalReject = reject;
      resolve = (value) => { clearTimeout(timeoutId); originalResolve(value); };
      reject = (error) => { clearTimeout(timeoutId); originalReject(error); };
    });
  }
  
  /**
   * Update file content (promotes large files to local if content provided)
   */
  static async updateFileContent(notebookId: string, filePath: string, content: string): Promise<boolean> {
    const db = await IndexedDBManager.getDB();
    const fileId = `${notebookId}::${filePath}`;
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        DB_CONFIG.STORES.FILES_METADATA,
        DB_CONFIG.STORES.FILES_CONTENT
      ], 'readwrite');
      
      const metaStore = transaction.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      const contentStore = transaction.objectStore(DB_CONFIG.STORES.FILES_CONTENT);
      
      // Get current metadata
      const getRequest = metaStore.get(fileId);
      
      getRequest.onsuccess = () => {
        const metadata = getRequest.result as FileMetadataEntity | undefined;
        
        if (!metadata) {
          reject(new Error('File not found'));
          return;
        }
        
        // Update metadata
        const updatedMetadata: FileMetadataEntity = {
          ...metadata,
          hasLocalContent: true,
          storageType: 'local',
          size: new Blob([content]).size,
          lastModified: new Date().toISOString(),
          lastAccessedAt: Date.now()
        };
        
        // Save updated metadata
        const metaUpdateRequest = metaStore.put(updatedMetadata);

        metaUpdateRequest.onsuccess = () => {
          // Save content
          const contentEntity: FileContentEntity = {
            fileId,
            content: this.defaultConfig.compressionEnabled ? this.compressContent(content) : content,
            compressed: this.defaultConfig.compressionEnabled,
            encoding: this.detectEncoding(content)
          };

          const contentRequest = contentStore.put(contentEntity);

          contentRequest.onsuccess = () => {
            // Adjust notebook stats for size change only
            const deltaBytes = (updatedMetadata.size || 0) - (metadata.size || 0);
            NotebookORM.adjustNotebookStats(notebookId, 0, deltaBytes)
              .catch(error => storageLog.error('Failed to adjust notebook stats after file update', { error }));
            resolve(true);
          };
          contentRequest.onerror = () => reject(contentRequest.error);
        };
        
        metaUpdateRequest.onerror = () => reject(metaUpdateRequest.error);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
      
      // Increase timeout for slower systems
      const timeoutId = setTimeout(() => {
        fileLog.warn('Update file timeout', {
          notebookId,
          filePath,
          timeoutMs: 20000
        });
        reject(new Error('Update file timeout - operation took longer than 20 seconds'));
      }, 20000); // Increased from 8s to 20s
      
      // Add timeout cleanup to success/error handlers
      const originalResolve = resolve;
      const originalReject = reject;
      resolve = (value) => { clearTimeout(timeoutId); originalResolve(value); };
      reject = (error) => { clearTimeout(timeoutId); originalReject(error); };
    });
  }
  
  /**
   * Get large files that only have metadata (for cleanup or remote sync)
   */
  static async getLargeFiles(notebookId?: string): Promise<FileMetadataEntity[]> {
    const db = await IndexedDBManager.getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DB_CONFIG.STORES.FILES_METADATA], 'readonly');
      const store = transaction.objectStore(DB_CONFIG.STORES.FILES_METADATA);
      
      let request: IDBRequest;
      
      if (notebookId) {
        const index = store.index('notebookId');
        request = index.openCursor(notebookId);
      } else {
        const index = store.index('isLargeFile');
        request = index.openCursor(true); // Only large files
      }
      
      const largeFiles: FileMetadataEntity[] = [];
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const metadata = cursor.value as FileMetadataEntity;
          if (metadata.isLargeFile && (!notebookId || metadata.notebookId === notebookId)) {
            largeFiles.push(metadata);
          }
          cursor.continue();
        } else {
          resolve(largeFiles);
        }
      };
      
      request.onerror = () => reject(request.error);
      
      // Increase timeout for slower systems
      const timeoutId = setTimeout(() => {
        fileLog.warn('Get large files timeout for notebook', {
          notebookId,
          timeoutMs: 15000
        });
        reject(new Error('Get large files timeout - operation took longer than 15 seconds'));
      }, 15000); // Increased from 5s to 15s
      
      // Add timeout cleanup to success/error handlers
      const originalResolve = resolve;
      const originalReject = reject;
      resolve = (value) => { clearTimeout(timeoutId); originalResolve(value); };
      reject = (error) => { clearTimeout(timeoutId); originalReject(error); };
    });
  }
  
  /**
   * Generate content preview for large files
   */
  private static generateContentPreview(content: string): string {
    const maxPreviewLength = 500;
    if (content.length <= maxPreviewLength) {
      return content;
    }
    
    // For text files, take first 500 characters
    if (typeof content === 'string') {
      return content.substring(0, maxPreviewLength) + '... [truncated]';
    }
    
    return '[Binary content preview not available]';
  }
  
  /**
   * Detect content encoding
   */
  private static detectEncoding(content: string): 'utf8' | 'base64' | 'binary' {
    if (typeof content !== 'string') return 'binary';
    
    // Check if it's base64
    if (/^data:/.test(content)) return 'base64';
    
    // Check for binary indicators
    try {
      // If it has null bytes or other binary indicators, it's likely binary
      if (content.includes('\0') || /[^\x20-\x7E\t\r\n]/.test(content.substring(0, 100))) {
        return 'binary';
      }
    } catch {
      return 'binary';
    }
    
    return 'utf8';
  }
  
  /**
   * Compress content (simple implementation)
   */
  private static compressContent(content: string): string {
    // For now, just return as-is
    // In a real implementation, you might use a compression library
    return content;
  }
  
  /**
   * Decompress content
   */
  private static decompressContent(content: string, compressed: boolean): string {
    if (!compressed) return content;
    
    // For now, just return as-is
    // In a real implementation, you would decompress
    return content;
  }
}