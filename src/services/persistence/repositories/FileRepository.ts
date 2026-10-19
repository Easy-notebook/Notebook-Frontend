import { AccessHistory } from './AccessHistory';
import { NotebookFileTotals } from './NotebookFileTotals';
import { FileRecordOwnership } from './FileRecordOwnership';
import { makeFileId } from '../../../storage/fileIdentity';
import { NotebookActivityRecord } from './NotebookActivityRecord';
import { StorageConfiguration } from '../../../storage/StorageConfiguration';
import {
  IFileRepository,
  IStorageProvider,
  type FileSaveData,
  type FileSaveOptions,
  type FileReadRecord,
} from '../interfaces';
import {
  FileMetadataEntity,
  NotebookEntity,
  NotebookActivityEntity,
  StorageConfigEntity,
} from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
import { FileContentRecord } from './FileContentRecord';
import { FileRecordSet } from './FileRecordSet';

export class FileRepository implements IFileRepository {
  constructor(private storage: IStorageProvider) {}

  private readonly mutationStores = [
    DB_CONFIG.STORES.FILES_METADATA,
    DB_CONFIG.STORES.FILES_CONTENT,
    DB_CONFIG.STORES.NOTEBOOKS,
    DB_CONFIG.STORES.ACTIVITIES,
  ];

  async saveFile<T extends FileSaveData>(
    fileData: T,
    options: FileSaveOptions = {}
  ): Promise<FileMetadataEntity> {
    const data: FileSaveData = { ...fileData };
    const settings = { ...options };
    if (!data.notebookId || !data.filePath || !data.fileName)
      throw new Error('Invalid file data: notebook identity, path and name are required');
    let records!: FileRecordSet;
    await this.storage.transaction(
      [...this.mutationStores, DB_CONFIG.STORES.CONFIG],
      'readwrite',
      async (stores) => {
        const stored = await this.read<StorageConfigEntity | undefined>(
          stores[DB_CONFIG.STORES.CONFIG].get('config')
        );
        const config = new StorageConfiguration(stored).toRecord();
        records = new FileRecordSet(data, {
          ...settings,
          maxFileSize: settings.maxFileSize ?? config.maxFileSize,
        });
        const existing = await this.read<FileMetadataEntity | undefined>(
          stores[DB_CONFIG.STORES.FILES_METADATA].get(records.metadata.id)
        );
        if (existing != null)
          new FileRecordOwnership(data.notebookId, data.filePath).verify(existing);
        records.writeTo(
          stores[DB_CONFIG.STORES.FILES_METADATA],
          stores[DB_CONFIG.STORES.FILES_CONTENT]
        );
        await this.recordMutation(
          stores,
          data.notebookId,
          data.filePath,
          existing ? 0 : 1,
          records.metadata.size - (existing == null ? 0 : NotebookFileTotals.size(existing.size)),
          'file_create'
        );
      }
    );
    return records.metadata;
  }

  async getFile(notebookId: string, filePath: string): Promise<FileReadRecord | null> {
    const fileId = makeFileId(notebookId, filePath);
    let result: Awaited<ReturnType<IFileRepository['getFile']>> = null;
    // Read the revision, update its access counters and read its content under one lock.
    // Separate transactions can overwrite a concurrent save with stale metadata.
    await this.storage.transaction(this.mutationStores, 'readwrite', async (stores) => {
      const metadataStore = stores[DB_CONFIG.STORES.FILES_METADATA];
      const metadata = await this.read<FileMetadataEntity | undefined>(metadataStore.get(fileId));
      if (metadata == null) return;
      new FileRecordOwnership(notebookId, filePath).verify(metadata);
      const content = FileContentRecord.expectsLocalContent(metadata)
        ? await this.readContent(stores[DB_CONFIG.STORES.FILES_CONTENT], fileId)
        : undefined;
      const accessed = {
        ...metadata,
        ...new AccessHistory(metadata).accessedAt(Date.now()).toRecord(),
      };
      metadataStore.put(accessed);
      await this.recordAccess(stores, notebookId, filePath);
      result = { metadata: accessed, content, needsRemoteFetch: content === undefined };
    });
    return result;
  }

  async getFilesForNotebook(notebookId: string, includeContent = false): Promise<FileReadRecord[]> {
    let results: Array<{
      metadata: FileMetadataEntity;
      content?: string;
      needsRemoteFetch: boolean;
    }> = [];
    const storeNames: string[] = [DB_CONFIG.STORES.FILES_METADATA];
    if (includeContent) storeNames.push(DB_CONFIG.STORES.FILES_CONTENT);
    await this.storage.transaction(storeNames, 'readonly', async (stores) => {
      const metadata = await this.read<FileMetadataEntity[]>(
        stores[DB_CONFIG.STORES.FILES_METADATA].index('notebookId').getAll(notebookId)
      );
      results = await Promise.all(
        metadata.map(async (metadata) => {
          new FileRecordOwnership(notebookId).verify(metadata);
          const expectsContent = FileContentRecord.expectsLocalContent(metadata);
          const content =
            includeContent && expectsContent
              ? await this.readContent(stores[DB_CONFIG.STORES.FILES_CONTENT], metadata.id)
              : undefined;
          return {
            metadata,
            content,
            needsRemoteFetch: includeContent ? content === undefined : !expectsContent,
          };
        })
      );
    });
    return results;
  }

  async deleteFile(notebookId: string, filePath: string): Promise<boolean> {
    const fileId = makeFileId(notebookId, filePath);
    await this.storage.transaction(this.mutationStores, 'readwrite', async (stores) => {
      const metadata = stores[DB_CONFIG.STORES.FILES_METADATA];
      const previous = await this.read<FileMetadataEntity | undefined>(metadata.get(fileId));
      await this.deleteRecord(stores, notebookId, filePath, previous);
    });
    return true;
  }

  /** Delete the notebook's cached file records and accounting in one commit. */
  async clearNotebook(notebookId: string): Promise<void> {
    await this.storage.transaction(this.mutationStores, 'readwrite', async (stores) => {
      const files = await this.read<FileMetadataEntity[]>(
        stores[DB_CONFIG.STORES.FILES_METADATA].index('notebookId').getAll(notebookId)
      );
      for (const file of files) {
        await this.deleteRecord(stores, notebookId, file.filePath, file);
      }
    });
  }

  private async deleteRecord(
    stores: Record<string, IDBObjectStore>,
    notebookId: string,
    filePath: string,
    previous?: FileMetadataEntity
  ): Promise<void> {
    const fileId = makeFileId(notebookId, filePath);
    if (previous != null) new FileRecordOwnership(notebookId, filePath).verify(previous);
    stores[DB_CONFIG.STORES.FILES_METADATA].delete(fileId);
    stores[DB_CONFIG.STORES.FILES_CONTENT].delete(fileId);
    if (previous) {
      await this.recordMutation(
        stores,
        notebookId,
        filePath,
        -1,
        -NotebookFileTotals.size(previous.size),
        'file_delete'
      );
    }
  }

  async updateFileContent(notebookId: string, filePath: string, content: string): Promise<boolean> {
    const fileId = makeFileId(notebookId, filePath);
    let updated = false;
    await this.storage.transaction(this.mutationStores, 'readwrite', async (stores) => {
      const metadataStore = stores[DB_CONFIG.STORES.FILES_METADATA];
      const metadata = await this.read<FileMetadataEntity | undefined>(metadataStore.get(fileId));
      if (metadata == null) return;
      new FileRecordOwnership(notebookId, filePath).verify(metadata);
      const records = FileRecordSet.localUpdate(metadata, content);
      records.writeTo(metadataStore, stores[DB_CONFIG.STORES.FILES_CONTENT]);
      await this.recordMutation(
        stores,
        notebookId,
        filePath,
        0,
        records.metadata.size - NotebookFileTotals.size(metadata.size),
        'file_create'
      );
      updated = true;
    });
    return updated;
  }

  async getLargeFiles(notebookId?: string): Promise<FileMetadataEntity[]> {
    let files: FileMetadataEntity[] = [];
    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA],
      'readonly',
      async (stores) => {
        const store = stores[DB_CONFIG.STORES.FILES_METADATA];
        // IndexedDB keys cannot be booleans; filter flags after an optional notebook index query.
        files = await this.read<FileMetadataEntity[]>(
          notebookId ? store.index('notebookId').getAll(notebookId) : store.getAll()
        );
      }
    );
    new FileRecordOwnership(notebookId).verifyAll(files);
    return files.filter((file) => file.isLargeFile);
  }

  private async recordAccess(
    stores: Record<string, IDBObjectStore>,
    notebookId: string,
    filePath: string
  ): Promise<void> {
    const now = Date.now();
    const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
    const notebook = await this.read<NotebookEntity | undefined>(store.get(notebookId));
    if (notebook)
      store.put({ ...notebook, ...new AccessHistory(notebook).accessedAt(now).toRecord() });
    stores[DB_CONFIG.STORES.ACTIVITIES].add(
      new NotebookActivityRecord(notebookId, 'file_access', now, filePath)
    );
  }

  private async recordMutation(
    stores: Record<string, IDBObjectStore>,
    notebookId: string,
    filePath: string,
    deltaCount: number,
    deltaBytes: number,
    activityType: NotebookActivityEntity['activityType']
  ): Promise<void> {
    const now = Date.now();
    stores[DB_CONFIG.STORES.ACTIVITIES].add(
      new NotebookActivityRecord(notebookId, activityType, now, filePath)
    );
    const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
    const notebook = await this.read<NotebookEntity | undefined>(store.get(notebookId));
    if (notebook) {
      store.put({
        ...notebook,
        ...new NotebookFileTotals(notebook.fileCount, notebook.totalSize)
          .adjust(deltaCount, deltaBytes)
          .toRecord(),
        updatedAt: now,
        lastAccessedAt: now,
      });
    } else if (activityType === 'file_create') {
      // The pending metadata write is visible in this transaction. Include any older
      // orphan files when establishing ownership; never infer counters from one delta.
      const files = await this.read<FileMetadataEntity[]>(
        stores[DB_CONFIG.STORES.FILES_METADATA].index('notebookId').getAll(notebookId)
      );
      new FileRecordOwnership(notebookId).verifyAll(files);
      store.put({
        id: notebookId,
        name: `Notebook ${notebookId.slice(0, 8)}`,
        description: 'Auto-created notebook',
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        ...NotebookFileTotals.fromFiles(files).toRecord(),
        cacheEnabled: true,
        retention: 'persistent',
      } satisfies NotebookEntity);
    }
  }

  private async readContent(store: IDBObjectStore, fileId: string): Promise<string | undefined> {
    const stored = await this.read<unknown>(store.get(fileId));
    return stored == null ? undefined : new FileContentRecord(stored, fileId).toRecord().content;
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
