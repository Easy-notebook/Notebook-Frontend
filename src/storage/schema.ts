// storage/schema.ts
// Database schema definitions for ORM

/**
 * Notebook entity - tracks notebook instances and metadata
 */
export interface NotebookEntity {
  id: string; // notebook ID
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  // Metadata
  fileCount: number;
  totalSize: number; // Total size of associated files in bytes
  // Settings
  cacheEnabled: boolean;
  maxCacheSize?: number; // Max cache size for this notebook in MB
}

/**
 * File metadata entity - tracks files with soft references for large files
 */
export interface FileMetadataEntity {
  id: string; // `${notebookId}::${filePath}`
  notebookId: string;
  filePath: string;
  fileName: string;
  fileType: string;
  size: number;
  lastModified: string;
  
  // Cache management
  cachedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  
  // Content storage strategy
  storageType: 'local' | 'remote' | 'hybrid';
  hasLocalContent: boolean; // Whether content is stored locally
  remoteUrl?: string; // Backend URL for large files
  contentHash?: string; // Content hash for verification
  
  // Soft reference for large files
  isLargeFile: boolean; // Files > threshold only store metadata
  contentPreview?: string; // Small preview/summary for large files
}

/**
 * File content entity - actual file content (only for smaller files)
 */
export interface FileContentEntity {
  fileId: string; // Links to FileMetadataEntity.id
  content: string; // Actual file content
  compressed: boolean; // Whether content is compressed
  encoding: 'utf8' | 'base64' | 'binary';
}

/**
 * Notebook activity log - tracks notebook usage for cleanup
 */
export interface NotebookActivityEntity {
  id: string; // `${notebookId}::${timestamp}`
  notebookId: string;
  activityType: 'open' | 'close' | 'file_access' | 'file_create' | 'file_delete';
  filePath?: string; // Optional file path for file-related activities
  timestamp: number;
  metadata?: Record<string, any>; // Additional activity metadata
}

/**
 * Tab state entity - tracks open tabs and active tab per notebook
 */
export interface TabStateEntity {
  notebookId: string; // Primary key
  tabList: Array<{
    id: string;
    path: string;
    name: string;
    type: string;
  }>;
  activeTabId: string | null;
  lastUpdated: number;
}

/**
 * Storage configuration
 */
export interface StorageConfigEntity {
  id: 'config'; // Single config record
  maxNotebooks: number; // Maximum number of notebooks to cache
  maxTotalSize: number; // Maximum total cache size in bytes
  maxFileSize: number; // Files larger than this are soft-referenced
  cleanupInterval: number; // Cleanup interval in ms
  retentionPeriod: number; // How long to keep inactive notebooks (ms)
  compressionEnabled: boolean;
  lastCleanup: number;
}

/**
 * Database stores configuration
 */
export const DB_STORES = {
  NOTEBOOKS: 'notebooks',
  FILES_METADATA: 'files_metadata', 
  FILES_CONTENT: 'files_content',
  ACTIVITIES: 'activities',
  CONFIG: 'config',
  TAB_STATES: 'tab_states'
} as const;

/**
 * Database indexes configuration
 */
export const DB_INDEXES = {
  // Notebook indexes
  NOTEBOOKS: {
    lastAccessed: 'lastAccessedAt',
    accessCount: 'accessCount',
    updatedAt: 'updatedAt'
  },
  
  // File metadata indexes
  FILES_METADATA: {
    notebookId: 'notebookId',
    notebookPath: ['notebookId', 'filePath'],
    lastAccessed: 'lastAccessedAt',
    storageType: 'storageType',
    isLargeFile: 'isLargeFile',
    cachedAt: 'cachedAt'
  },
  
  // File content indexes
  FILES_CONTENT: {
    fileId: 'fileId'
  },
  
  // Activity indexes
  ACTIVITIES: {
    notebookId: 'notebookId',
    timestamp: 'timestamp',
    notebookTimestamp: ['notebookId', 'timestamp'],
    activityType: 'activityType'
  },
  
  // Tab state indexes
  TAB_STATES: {
    lastUpdated: 'lastUpdated'
  }
} as const;

/**
 * Default storage configuration
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfigEntity = {
  id: 'config',
  maxNotebooks: 50,
  maxTotalSize: 500 * 1024 * 1024, // 500MB
  maxFileSize: 10 * 1024 * 1024, // 10MB - files larger than this are soft-referenced
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
  compressionEnabled: true,
  lastCleanup: 0
};