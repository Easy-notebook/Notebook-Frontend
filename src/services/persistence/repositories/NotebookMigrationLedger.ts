interface MigrationRecord {
  notebookId: string;
  state: 'imported' | 'deleted';
  sources: string[];
  updatedAt: number;
}

/** Durable migration state. All reads/transitions belong to the caller's transaction. */
export class NotebookMigrationLedger {
  private constructor(
    private readonly store: IDBObjectStore,
    private readonly notebookId: string,
    private record: MigrationRecord | undefined
  ) {}

  static async load(store: IDBObjectStore, notebookId: string): Promise<NotebookMigrationLedger> {
    const record = await new Promise<MigrationRecord | undefined>((resolve, reject) => {
      const request = store.get(notebookId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new NotebookMigrationLedger(store, notebookId, record);
  }

  allows(source: string): boolean {
    return this.record?.state !== 'deleted' && !this.record?.sources.includes(source);
  }

  complete(source: string): void {
    if (!this.allows(source)) throw new Error('Migration source is already terminal');
    this.write('imported', [...(this.record?.sources ?? []), source]);
  }

  markDeleted(): void {
    if (this.record?.state === 'deleted') return;
    this.write('deleted', this.record?.sources ?? []);
  }

  private write(state: MigrationRecord['state'], sources: string[]): void {
    this.record = { notebookId: this.notebookId, state, sources, updatedAt: Date.now() };
    this.store.put(this.record);
  }
}
