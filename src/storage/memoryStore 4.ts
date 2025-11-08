// storage/memoryStore.ts
// Lightweight in-memory fallback for environments where IndexedDB is unavailable (e.g., Safari Private Mode)

import type {
  NotebookEntity,
  FileMetadataEntity,
  FileContentEntity,
  NotebookActivityEntity,
  StorageConfigEntity,
} from './schema';

// Local type definition to avoid circular dependency with splitPreviewCache.ts
interface SplitFileDataType {
  id: string;
  notebookId: string;
  filePath: string;
  fileName: string;
  content: string;
  type: string;
  size: number;
  lastModified: string;
  cachedAt: number;
  metadata?: Record<string, unknown>;
}

export class MemoryStore {
  // Notebooks and activities
  static notebooks = new Map<string, NotebookEntity>();
  static activities = new Map<string, NotebookActivityEntity>();

  // Files
  static filesMeta = new Map<string, FileMetadataEntity>(); // key: `${notebookId}::${filePath}`
  static filesContent = new Map<string, FileContentEntity>(); // key: fileId

  // Config and tab states
  static config: StorageConfigEntity | null = null;
  static tabStates = new Map<
    string,
    {
      notebookId: string;
      tabList: Array<{ id: string; path: string; name: string; type: string }>;
      activeTabId: string | null;
      lastUpdated: number;
    }
  >();
  // Split preview cache (separate from main cache)
  static splitFiles = new Map<string, SplitFileDataType>(); // key: `${notebookId}::${filePath}`

  static reset(): void {
    this.notebooks.clear();
    this.activities.clear();
    this.filesMeta.clear();
    this.filesContent.clear();
    this.tabStates.clear();
    this.splitFiles.clear();
    this.config = null;
  }
}
