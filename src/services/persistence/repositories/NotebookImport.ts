import { FileRecordOwnership } from './FileRecordOwnership';
import { AccessHistory } from './AccessHistory';
import { NotebookFileTotals } from './NotebookFileTotals';
import type { FileSaveData, IStorageProvider, NotebookSaveData } from '../interfaces';
import type {
  FileContentEntity,
  FileMetadataEntity,
  NotebookEntity,
} from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
import { FileRecordSet } from './FileRecordSet';
import { NotebookActivityRecord } from './NotebookActivityRecord';
import { NotebookMigrationLedger } from './NotebookMigrationLedger';

/** Import only missing records. Identity/content conflicts reject the entire notebook. */
export class NotebookImport {
  private readonly notebook: NotebookSaveData;
  private readonly files = new Map<string, FileRecordSet>();

  constructor(
    notebook: NotebookSaveData,
    files: FileSaveData[],
    private readonly source?: string
  ) {
    if (source !== undefined && !source.trim()) throw new Error('Invalid migration source');
    this.notebook = { ...notebook, ...new AccessHistory(notebook).toRecord() };
    for (const file of files) {
      if (!notebook.id || file.notebookId !== notebook.id || !file.filePath) {
        throw new Error('Invalid import notebook/file identity');
      }
      const record = new FileRecordSet(file, { forceLocal: true });
      const previous = this.files.get(record.metadata.id);
      if (previous && previous.content?.content !== record.content?.content) {
        throw new Error(`Conflicting source file: ${file.filePath}`);
      }
      this.files.set(record.metadata.id, record);
    }
  }

  async commit(storage: IStorageProvider): Promise<number> {
    const names = DB_CONFIG.STORES;
    const scope: string[] = [
      names.NOTEBOOKS,
      names.FILES_METADATA,
      names.FILES_CONTENT,
      names.ACTIVITIES,
    ];
    if (this.source) scope.push(names.MIGRATION_LEDGER);
    let imported = 0;
    await storage.transaction(scope, 'readwrite', async (stores) => {
      const ledger = this.source
        ? await NotebookMigrationLedger.load(stores[names.MIGRATION_LEDGER], this.notebook.id)
        : undefined;
      if (ledger && !ledger.allows(this.source!)) return;
      const notebooks = stores[names.NOTEBOOKS];
      const metadata = stores[names.FILES_METADATA];
      const content = stores[names.FILES_CONTENT];
      const incoming = [...this.files.values()];
      const [existing, current, bodies] = await Promise.all([
        this.read<NotebookEntity | undefined>(notebooks.get(this.notebook.id)),
        this.read<FileMetadataEntity[]>(metadata.index('notebookId').getAll(this.notebook.id)),
        Promise.all(
          incoming.map((file) =>
            this.read<FileContentEntity | undefined>(content.get(file.metadata.id))
          )
        ),
      ]);
      new FileRecordOwnership(this.notebook.id).verifyAll(current);
      const currentById = new Map(current.map((file) => [file.id, file]));
      const missing: FileRecordSet[] = [];
      incoming.forEach((file, index) => {
        const previous = currentById.get(file.metadata.id);
        const body = bodies[index];
        if (previous || body) {
          if (
            !previous ||
            !body ||
            previous.storageType !== 'local' ||
            body.content !== file.content?.content
          ) {
            throw new Error(`Destination file conflict: ${file.metadata.filePath}`);
          }
        } else {
          missing.push(file);
        }
      });
      // Equal file bodies do not establish ownership when their parent is absent.
      if (incoming.length === 0) return;
      const existingHistory = existing == null ? undefined : new AccessHistory(existing);
      if (missing.length === 0 && existing) {
        ledger?.complete(this.source!);
        return;
      }
      const now = Date.now();
      const notebook: NotebookEntity = {
        ...(existing ?? this.notebook),
        ...(
          existingHistory ??
          current.reduce(
            (history, file) => history.merge(new AccessHistory(file)),
            new AccessHistory(this.notebook)
          )
        ).toRecord(),
        retention: 'persistent',
        ...NotebookFileTotals.fromFiles([
          ...current,
          ...missing.map((file) => file.metadata),
        ]).toRecord(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      for (const file of missing) {
        metadata.add(file.metadata);
        content.add(file.content!);
      }
      notebooks.put(notebook);
      stores[names.ACTIVITIES].add(new NotebookActivityRecord(notebook.id, 'open', now));
      ledger?.complete(this.source!);
      imported = missing.length;
    });
    return imported;
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
