import type {
  INotebookRecoveryRepository,
  IStorageProvider,
  NotebookRecoveryData,
  NotebookRecoveryRecord,
  NotebookEntity,
} from '../interfaces';
import { DB_STORES } from '../../../storage/schema';
import { v4 as uuid } from 'uuid';
import { RecoveredNotebookCopy } from './RecoveredNotebookCopy';
import { NotebookActivityRecord } from './NotebookActivityRecord';

/** Recovery drafts are independent of canonical documents and never subject to cache eviction. */
export class NotebookRecoveryRepository implements INotebookRecoveryRepository {
  constructor(
    private readonly storage: IStorageProvider,
    private readonly createId: () => string = uuid
  ) {}

  async restoreDraft(id: string, revision: number): Promise<NotebookEntity | null> {
    let restored: NotebookEntity | null = null;
    const S = DB_STORES;
    await this.storage.transaction(
      [S.NOTEBOOK_RECOVERY, S.NOTEBOOKS, S.FILES_METADATA, S.FILES_CONTENT, S.ACTIVITIES],
      'readwrite',
      async (stores) => {
        const recovery = stores[S.NOTEBOOK_RECOVERY];
        const draft = await this.read<NotebookRecoveryRecord | undefined>(recovery.get(id));
        if (!draft || draft.revision !== revision) return;
        const copy = new RecoveredNotebookCopy(draft, this.createId());
        const ownedFiles = await this.read(
          stores[S.FILES_METADATA].index('notebookId').count(copy.notebook.id)
        );
        if (ownedFiles > 0) throw new Error('Recovery notebook identity already owns files');
        stores[S.NOTEBOOKS].add(copy.notebook);
        stores[S.FILES_METADATA].add(copy.file.metadata);
        stores[S.FILES_CONTENT].add(copy.file.content!);
        stores[S.ACTIVITIES].add(new NotebookActivityRecord(copy.notebook.id, 'open', Date.now()));
        recovery.delete(id);
        restored = copy.notebook;
      }
    );
    return restored;
  }

  async saveDraft(data: NotebookRecoveryData): Promise<NotebookRecoveryRecord> {
    const captured = { ...data };
    if (
      !captured.notebookId?.trim() ||
      !captured.writerId?.trim() ||
      !Number.isSafeInteger(captured.revision) ||
      captured.revision < 1 ||
      typeof captured.content !== 'string' ||
      !['content_changed', 'empty_overwrite'].includes(captured.reason) ||
      (captured.expectedContent !== null && typeof captured.expectedContent !== 'string')
    ) {
      throw new Error('Invalid recovery draft');
    }
    const id = JSON.stringify([captured.writerId, captured.notebookId]);
    let saved!: NotebookRecoveryRecord;
    await this.storage.transaction([DB_STORES.NOTEBOOK_RECOVERY], 'readwrite', async (stores) => {
      const store = stores[DB_STORES.NOTEBOOK_RECOVERY];
      const previous = await this.read<NotebookRecoveryRecord | undefined>(store.get(id));
      if (previous && previous.revision >= captured.revision) {
        if (previous.revision === captured.revision && previous.content !== captured.content) {
          throw new Error('Recovery revision content mismatch');
        }
        saved = previous;
        return;
      }
      const now = Date.now();
      saved = { ...captured, id, createdAt: previous?.createdAt ?? now, updatedAt: now };
      store.put(saved);
    });
    return saved;
  }

  async listDrafts(notebookId?: string): Promise<NotebookRecoveryRecord[]> {
    let records: NotebookRecoveryRecord[] = [];
    await this.storage.transaction([DB_STORES.NOTEBOOK_RECOVERY], 'readonly', async (stores) => {
      const store = stores[DB_STORES.NOTEBOOK_RECOVERY];
      records = await this.read<NotebookRecoveryRecord[]>(
        notebookId === undefined ? store.getAll() : store.index('notebookId').getAll(notebookId)
      );
    });
    return records.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }

  async discardDraft(id: string, revision: number): Promise<boolean> {
    let deleted = false;
    await this.storage.transaction([DB_STORES.NOTEBOOK_RECOVERY], 'readwrite', async (stores) => {
      const store = stores[DB_STORES.NOTEBOOK_RECOVERY];
      const existing = await this.read<NotebookRecoveryRecord | undefined>(store.get(id));
      if (existing?.revision !== revision) return;
      store.delete(id);
      deleted = true;
    });
    return deleted;
  }

  private read<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
