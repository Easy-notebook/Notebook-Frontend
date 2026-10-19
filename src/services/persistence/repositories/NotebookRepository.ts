import { FileRecordOwnership } from './FileRecordOwnership';
import { FileContentRecord } from './FileContentRecord';
import { AccessHistory } from './AccessHistory';
import { NotebookFileTotals } from './NotebookFileTotals';
import { NotebookActivityRecord } from './NotebookActivityRecord';
import {
  INotebookRepository,
  IStorageProvider,
  type NotebookSaveData,
  type FileSaveData,
  type NotebookSnapshotCondition,
} from '../interfaces';
import {
  NotebookEntity,
  NotebookActivityEntity,
  FileMetadataEntity,
  FileContentEntity,
} from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
import { NotebookDeletion } from './NotebookDeletion';
import { FileRecordSet } from './FileRecordSet';
import { NotebookImport } from './NotebookImport';
import { NotebookConflictError } from '../NotebookConflictError';

export class NotebookRepository implements INotebookRepository {
  constructor(private storage: IStorageProvider) {}

  async importNotebook(
    notebook: NotebookSaveData,
    files: FileSaveData[],
    source?: string
  ): Promise<number> {
    return new NotebookImport(notebook, files, source).commit(this.storage);
  }

  async saveNotebook(notebookData: NotebookSaveData): Promise<NotebookEntity> {
    return this.persistNotebook({ ...notebookData });
  }

  async saveNotebookSnapshot(
    file: FileSaveData,
    notebook: NotebookSaveData,
    condition?: NotebookSnapshotCondition
  ) {
    if (file.notebookId !== notebook.id) throw new Error('Snapshot notebook identity mismatch');
    const records = new FileRecordSet(file, { forceLocal: true });
    await this.persistNotebook({ ...notebook }, records, condition && { ...condition });
    return records.metadata;
  }

  private async persistNotebook(
    data: NotebookSaveData,
    file?: FileRecordSet,
    condition?: NotebookSnapshotCondition
  ): Promise<NotebookEntity> {
    const inputHistory = new AccessHistory(data);
    const names: string[] = [
      DB_CONFIG.STORES.NOTEBOOKS,
      DB_CONFIG.STORES.ACTIVITIES,
      DB_CONFIG.STORES.FILES_METADATA,
    ];
    if (file) names.push(DB_CONFIG.STORES.FILES_CONTENT);
    let notebook!: NotebookEntity;
    await this.storage.transaction(names, 'readwrite', async (stores) => {
      const notebooks = stores[DB_CONFIG.STORES.NOTEBOOKS];
      const [existing, files] = await Promise.all([
        this.read<NotebookEntity | undefined>(notebooks.get(data.id)),
        this.read<FileMetadataEntity[]>(
          stores[DB_CONFIG.STORES.FILES_METADATA].index('notebookId').getAll(data.id)
        ),
      ]);
      new FileRecordOwnership(data.id).verifyAll(files);
      if (file && condition) {
        const current = await this.read<FileContentEntity | undefined>(
          stores[DB_CONFIG.STORES.FILES_CONTENT].get(file.metadata.id)
        );
        const metadata = files.find((record) => record.id === file.metadata.id);
        const matches =
          condition.expectedContent === null
            ? !metadata && !current
            : metadata != null &&
              FileContentRecord.expectsLocalContent(metadata) &&
              current?.content === condition.expectedContent;
        if (!matches) throw new NotebookConflictError(data.id, file.metadata.filePath);
      }
      const retained = file ? files.filter((record) => record.id !== file.metadata.id) : files;
      const now = Date.now();
      let history =
        existing == null ? inputHistory : inputHistory.merge(new AccessHistory(existing));
      if (file) history = history.merge(inputHistory.observedAt(now));
      notebook = {
        ...data,
        // Metadata inputs can be stale. File-derived counters belong to this transaction.
        ...NotebookFileTotals.fromFiles(file ? [...retained, file.metadata] : retained).toRecord(),
        ...history.toRecord(),
        retention:
          file || (existing && existing.retention !== 'evictable')
            ? 'persistent'
            : (data.retention ?? existing?.retention ?? 'persistent'),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      notebooks.put(notebook);
      stores[DB_CONFIG.STORES.ACTIVITIES].add(new NotebookActivityRecord(data.id, 'open', now));
      file?.writeTo(
        stores[DB_CONFIG.STORES.FILES_METADATA],
        stores[DB_CONFIG.STORES.FILES_CONTENT]
      );
    });
    return notebook;
  }

  async getNotebook(id: string): Promise<NotebookEntity | null> {
    return (await this.accessNotebook(id)) ?? null;
  }

  async getAllNotebooks(
    options: { orderBy?: string; limit?: number; offset?: number } = {}
  ): Promise<NotebookEntity[]> {
    // Note: IndexedDB getAll doesn't support sorting/pagination natively in a simple way without cursors.
    // The IStorageProvider interface I defined is simple.
    // For now, I will fetch all and sort/filter in memory, or I would need to expand IStorageProvider.
    // Given the scale (likely < 1000 notebooks), in-memory sorting is acceptable for this refactor.
    // Ideally, IStorageProvider should expose openCursor.

    const notebooks = await this.storage.getAll<NotebookEntity>(DB_CONFIG.STORES.NOTEBOOKS);

    if (options.orderBy) {
      notebooks.sort((a, b) => {
        const valA = (a as any)[options.orderBy!];
        const valB = (b as any)[options.orderBy!];
        return valB - valA; // Descending
      });
    } else {
      // Default sort by lastAccessedAt
      notebooks.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
    }

    let result = notebooks;
    if (options.offset) {
      result = result.slice(options.offset);
    }
    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async deleteNotebook(id: string): Promise<boolean> {
    await this.storage.transaction(NotebookDeletion.stores, 'readwrite', async (stores) => {
      await new NotebookDeletion(stores).delete(id);
    });
    return true;
  }

  async updateAccessTime(id: string): Promise<void> {
    await this.accessNotebook(id);
  }

  private async accessNotebook(id: string): Promise<NotebookEntity | undefined> {
    let notebook: NotebookEntity | undefined;
    await this.storage.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readwrite', async (stores) => {
      const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
      const stored = await this.read<NotebookEntity | undefined>(store.get(id));
      if (stored == null) return;
      notebook = { ...stored, ...new AccessHistory(stored).accessedAt(Date.now()).toRecord() };
      store.put(notebook);
    });
    return notebook;
  }

  async getNotebookStats(id: string): Promise<{
    fileCount: number;
    totalSize: number;
    lastActivity: number;
    activities: NotebookActivityEntity[];
  }> {
    let files: FileMetadataEntity[] = [];
    let activities: NotebookActivityEntity[] = [];
    await this.storage.transaction(
      [DB_CONFIG.STORES.FILES_METADATA, DB_CONFIG.STORES.ACTIVITIES],
      'readonly',
      async (stores) => {
        [files, activities] = await Promise.all([
          this.read<FileMetadataEntity[]>(
            stores[DB_CONFIG.STORES.FILES_METADATA].index('notebookId').getAll(id)
          ),
          this.read<NotebookActivityEntity[]>(
            stores[DB_CONFIG.STORES.ACTIVITIES].index('notebookId').getAll(id)
          ),
        ]);
      }
    );
    new FileRecordOwnership(id).verifyAll(files);
    activities.sort((a, b) => b.timestamp - a.timestamp);
    return {
      ...NotebookFileTotals.fromFiles(files).toRecord(),
      lastActivity: activities[0]?.timestamp ?? 0,
      activities: activities.slice(0, 50),
    };
  }

  async logActivity(
    notebookId: string,
    activityType: NotebookActivityEntity['activityType'],
    filePath?: string,
    metadata?: NotebookActivityEntity['metadata']
  ): Promise<void> {
    const activity = new NotebookActivityRecord(
      notebookId,
      activityType,
      Date.now(),
      filePath,
      metadata
    );
    await this.storage.transaction([DB_CONFIG.STORES.ACTIVITIES], 'readwrite', async (stores) => {
      stores[DB_CONFIG.STORES.ACTIVITIES].add(activity);
    });
  }

  async getInactiveNotebooks(retentionPeriod: number): Promise<NotebookEntity[]> {
    let notebooks: NotebookEntity[] = [];
    await this.storage.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readonly', async (stores) => {
      notebooks = await this.read<NotebookEntity[]>(
        stores[DB_CONFIG.STORES.NOTEBOOKS]
          .index('lastAccessedAt')
          .getAll(IDBKeyRange.upperBound(Date.now() - retentionPeriod))
      );
    });
    return notebooks;
  }

  async adjustNotebookStats(
    notebookId: string,
    deltaFileCount: number,
    deltaBytes: number
  ): Promise<void> {
    await this.storage.transaction([DB_CONFIG.STORES.NOTEBOOKS], 'readwrite', async (stores) => {
      const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
      const notebook = await this.read<NotebookEntity | undefined>(store.get(notebookId));
      if (!notebook) return;
      store.put({
        ...notebook,
        ...new NotebookFileTotals(notebook.fileCount, notebook.totalSize)
          .adjust(deltaFileCount, deltaBytes)
          .toRecord(),
        updatedAt: Date.now(),
      });
    });
  }

  async recalcNotebookStats(notebookId: string): Promise<void> {
    await this.storage.transaction(
      [DB_CONFIG.STORES.NOTEBOOKS, DB_CONFIG.STORES.FILES_METADATA],
      'readwrite',
      async (stores) => {
        const store = stores[DB_CONFIG.STORES.NOTEBOOKS];
        const [notebook, files] = await Promise.all([
          this.read<NotebookEntity | undefined>(store.get(notebookId)),
          this.read<FileMetadataEntity[]>(
            stores[DB_CONFIG.STORES.FILES_METADATA].index('notebookId').getAll(notebookId)
          ),
        ]);
        if (!notebook) return;
        new FileRecordOwnership(notebookId).verifyAll(files);
        store.put({
          ...notebook,
          ...NotebookFileTotals.fromFiles(files).toRecord(),
          updatedAt: Date.now(),
        });
      }
    );
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
