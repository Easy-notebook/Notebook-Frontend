import type {
  INotebookRecoveryRepository,
  IStorageProvider,
  NotebookRecoveryData,
  NotebookRecoveryRecord,
} from '../interfaces';
import { DB_STORES } from '../../../storage/schema';

/** Recovery drafts are independent of canonical documents and never subject to cache eviction. */
export class NotebookRecoveryRepository implements INotebookRecoveryRepository {
  constructor(private readonly storage: IStorageProvider) {}

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
