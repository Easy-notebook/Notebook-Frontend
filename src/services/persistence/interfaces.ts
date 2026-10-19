import type { StorageStats } from '../../storage/StorageUsage';
import type {
  CleanupMode,
  CleanupStats,
  CleanupCandidates,
} from '../../storage/NotebookRetentionPolicy';
import type {
  NotebookEntity,
  FileMetadataEntity,
  NotebookActivityEntity,
  TabStateEntity,
  SplitFileEntity,
  StorageConfigEntity,
} from '../../storage/schema';
export type {
  NotebookEntity,
  FileMetadataEntity,
  NotebookActivityEntity,
  TabStateEntity,
  SplitFileEntity,
  StorageConfigEntity,
};

export interface FileSaveData {
  notebookId: string;
  filePath: string;
  fileName: string;
  content: string;
  size: number;
  lastModified: string;
  remoteUrl?: string;
}

export interface FileSaveOptions {
  maxFileSize?: number;
  forceLocal?: boolean;
}

/** Compare the observed body atomically before committing a notebook snapshot. */
export interface NotebookSnapshotCondition {
  expectedContent: string | null;
}

export interface IStorageProvider {
  initialize(): Promise<void>;
  close(): Promise<void>;
  get<T>(storeName: string, key: string): Promise<T | undefined>;
  getAll<T>(storeName: string): Promise<T[]>;
  put<T>(storeName: string, value: T): Promise<void>;
  delete(storeName: string, key: string): Promise<void>;
  transaction(
    storeNames: string[],
    mode: 'readonly' | 'readwrite',
    callback: (stores: Record<string, IDBObjectStore>) => Promise<void>
  ): Promise<void>;
}

/** File-derived counters are accepted on metadata objects but computed by the repository. */
export type NotebookSaveData = Omit<
  NotebookEntity,
  'createdAt' | 'updatedAt' | 'fileCount' | 'totalSize'
> &
  Partial<Pick<NotebookEntity, 'fileCount' | 'totalSize'>>;

export interface INotebookRepository {
  importNotebook(
    notebook: NotebookSaveData,
    files: FileSaveData[],
    source?: string
  ): Promise<number>;
  saveNotebookSnapshot(
    file: FileSaveData,
    notebook: NotebookSaveData,
    condition?: NotebookSnapshotCondition
  ): Promise<FileMetadataEntity>;
  saveNotebook(notebook: NotebookSaveData): Promise<NotebookEntity>;
  getNotebook(id: string): Promise<NotebookEntity | null>;
  getAllNotebooks(options?: {
    orderBy?: string;
    limit?: number;
    offset?: number;
  }): Promise<NotebookEntity[]>;
  deleteNotebook(id: string): Promise<boolean>;
  updateAccessTime(id: string): Promise<void>;
  logActivity(
    notebookId: string,
    activityType: NotebookActivityEntity['activityType'],
    filePath?: string,
    metadata?: NotebookActivityEntity['metadata']
  ): Promise<void>;
  getInactiveNotebooks(retentionPeriod: number): Promise<NotebookEntity[]>;
  adjustNotebookStats(
    notebookId: string,
    deltaFileCount: number,
    deltaBytes: number
  ): Promise<void>;
  recalcNotebookStats(notebookId: string): Promise<void>;
  getNotebookStats(id: string): Promise<{
    fileCount: number;
    totalSize: number;
    lastActivity: number;
    activities: NotebookActivityEntity[];
  }>;
}

export interface FileReadRecord {
  metadata: FileMetadataEntity;
  content?: string;
  needsRemoteFetch?: boolean;
}

export interface IFileRepository {
  saveFile<T extends FileSaveData>(
    fileData: T,
    options?: FileSaveOptions
  ): Promise<FileMetadataEntity>;
  getLargeFiles(notebookId?: string): Promise<FileMetadataEntity[]>;
  getFile(notebookId: string, filePath: string): Promise<FileReadRecord | null>;
  getFilesForNotebook(notebookId: string, includeContent?: boolean): Promise<FileReadRecord[]>;
  deleteFile(notebookId: string, filePath: string): Promise<boolean>;
  clearNotebook(notebookId: string): Promise<void>;
  updateFileContent(notebookId: string, filePath: string, content: string): Promise<boolean>;
}

export interface ITabRepository {
  saveTabState(notebookId: string, tabList: any[], activeTabId: string | null): Promise<void>;
  getTabState(notebookId: string): Promise<TabStateEntity | null>;
  deleteTabState(notebookId: string): Promise<void>;
  getAllTabStates(): Promise<TabStateEntity[]>;
}

export interface ISplitFileRepository {
  saveFile(notebookId: string, filePath: string, fileData: any): Promise<void>;
  getFile(notebookId: string, filePath: string): Promise<SplitFileEntity | null>;
  deleteFile(notebookId: string, filePath: string): Promise<void>;
  clearNotebook(notebookId: string): Promise<void>;
  clearAll(): Promise<void>;
  getStats(): Promise<{ totalFiles: number; totalSize: number }>;
}

export interface IStorageMaintenanceRepository {
  getStorageStats(): Promise<StorageStats>;
  cleanup(mode?: CleanupMode): Promise<CleanupStats>;
  getCleanupCandidates(): Promise<CleanupCandidates>;
  getConfig(): Promise<StorageConfigEntity>;
  ensureConfig(): Promise<void>;
  updateConfig(patch: Partial<StorageConfigEntity>): Promise<void>;
  cleanupActivities(retentionPeriod: number): Promise<void>;
}

export interface IPersistenceService {
  recovery: INotebookRecoveryRepository;
  maintenance: IStorageMaintenanceRepository;
  notebooks: INotebookRepository;
  files: IFileRepository;
  tabs: ITabRepository;
  splitFiles: ISplitFileRepository;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

export interface NotebookRecoveryData {
  notebookId: string;
  writerId: string;
  revision: number;
  content: string;
  expectedContent: string | null;
  reason: 'content_changed' | 'empty_overwrite';
}

export interface NotebookRecoveryRecord extends NotebookRecoveryData {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface INotebookRecoveryRepository {
  restoreDraft(id: string, revision: number): Promise<NotebookEntity | null>;
  saveDraft(data: NotebookRecoveryData): Promise<NotebookRecoveryRecord>;
  listDrafts(notebookId?: string): Promise<NotebookRecoveryRecord[]>;
  discardDraft(id: string, revision: number): Promise<boolean>;
}
