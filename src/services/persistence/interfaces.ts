import type {
  NotebookEntity,
  FileMetadataEntity,
  NotebookActivityEntity,
  TabStateEntity,
  SplitFileEntity,
} from '../../storage/schema';
export type {
  NotebookEntity,
  FileMetadataEntity,
  NotebookActivityEntity,
  TabStateEntity,
  SplitFileEntity,
};

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

export interface INotebookRepository {
  saveNotebook(notebook: Omit<NotebookEntity, 'createdAt' | 'updatedAt'>): Promise<NotebookEntity>;
  getNotebook(id: string): Promise<NotebookEntity | null>;
  getAllNotebooks(options?: {
    orderBy?: string;
    limit?: number;
    offset?: number;
  }): Promise<NotebookEntity[]>;
  deleteNotebook(id: string): Promise<boolean>;
  updateAccessTime(id: string): Promise<void>;
  getNotebookStats(
    id: string
  ): Promise<{
    fileCount: number;
    totalSize: number;
    lastActivity: number;
    activities: NotebookActivityEntity[];
  }>;
}

export interface IFileRepository {
  saveFile(fileData: any, options?: any): Promise<FileMetadataEntity>;
  getFile(
    notebookId: string,
    filePath: string
  ): Promise<{ metadata: FileMetadataEntity; content?: string; needsRemoteFetch?: boolean } | null>;
  getFilesForNotebook(notebookId: string, includeContent?: boolean): Promise<any[]>;
  deleteFile(notebookId: string, filePath: string): Promise<boolean>;
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

export interface IPersistenceService {
  notebooks: INotebookRepository;
  files: IFileRepository;
  tabs: ITabRepository;
  splitFiles: ISplitFileRepository;
  initialize(): Promise<void>;
  close(): Promise<void>;
}
