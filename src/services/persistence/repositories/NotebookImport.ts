import type { FileSaveData, IStorageProvider, NotebookSaveData } from '../interfaces';
import type {
  FileContentEntity,
  FileMetadataEntity,
  NotebookEntity,
} from '../../../storage/schema';
import { DB_CONFIG } from '../../../storage/database';
import { FileRecordSet } from './FileRecordSet';
import { NotebookActivityRecord } from './NotebookActivityRecord';

/** Import only missing records. Identity/content conflicts reject the entire notebook. */
export class NotebookImport {
  private readonly notebook: NotebookSaveData;
  private readonly files = new Map<string, FileRecordSet>();

  constructor(notebook: NotebookSaveData, files: FileSaveData[]) {
    this.notebook = { ...notebook };
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
    let imported = 0;
    await storage.transaction(
      [names.NOTEBOOKS, names.FILES_METADATA, names.FILES_CONTENT, names.ACTIVITIES],
      'readwrite',
      async (stores) => {
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
        if (missing.length === 0) return;
        const now = Date.now();
        const notebook: NotebookEntity = {
          ...(existing ?? this.notebook),
          retention: 'persistent',
          fileCount: current.length + missing.length,
          totalSize:
            current.reduce((sum, file) => sum + file.size, 0) +
            missing.reduce((sum, file) => sum + file.metadata.size, 0),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        for (const file of missing) {
          metadata.add(file.metadata);
          content.add(file.content!);
        }
        notebooks.put(notebook);
        stores[names.ACTIVITIES].add(new NotebookActivityRecord(notebook.id, 'open', now));
        imported = missing.length;
      }
    );
    return imported;
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
