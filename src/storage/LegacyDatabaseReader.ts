interface LegacyReadResult {
  hasFiles: boolean;
  files: unknown[];
}

/** One read attempt. Terminal callbacks never acquire a connection or publish partial data. */
export class LegacyDatabaseReader {
  private state: 'idle' | 'opening' | 'reading' | 'settled' = 'idle';
  private completion?: Promise<LegacyReadResult>;

  constructor(
    private readonly name: string,
    private readonly mode: 'probe' | 'files',
    private readonly timeoutMs: number,
    private readonly factory?: IDBFactory
  ) {}

  run(): Promise<LegacyReadResult> {
    if (this.completion) return this.completion;
    this.completion = new Promise((resolve, reject) => {
      this.state = 'opening';
      let database: IDBDatabase | undefined;
      let transaction: IDBTransaction | undefined;
      const finish = (
        error?: unknown,
        result: LegacyReadResult = { hasFiles: false, files: [] }
      ) => {
        if (this.state === 'settled') return;
        this.state = 'settled';
        clearTimeout(timer);
        if (error && transaction) {
          try {
            transaction.abort();
          } catch {
            /* The native transaction already finished. */
          }
        }
        database?.close();
        if (error) reject(error);
        else resolve(result);
      };
      const timer = setTimeout(
        () => finish(new Error(`Legacy read from ${this.name} timed out`)),
        this.timeoutMs
      );
      let request: IDBOpenDBRequest;
      try {
        request = (this.factory ?? indexedDB).open(this.name);
      } catch (error) {
        finish(error);
        return;
      }
      request.onerror = () => finish(request.error ?? new Error(`Failed to open ${this.name}`));
      request.onblocked = () => finish(new Error(`Legacy database ${this.name} is blocked`));
      request.onupgradeneeded = () => {
        // Opening without a version upgrades only when the database is absent.
        // Abort its creation; probing must never create a historical database.
        request.transaction?.abort();
        request.result.close();
        finish();
      };
      request.onsuccess = () => {
        const opened = request.result;
        if (this.state === 'settled') {
          opened.close();
          return;
        }
        database = opened;
        database.onversionchange = () =>
          finish(new Error(`Legacy database ${this.name} changed version`));
        try {
          const names = Array.from(database.objectStoreNames).filter(
            (name) => name.includes('file') || name.includes('cache')
          );
          if (names.length === 0) {
            finish();
            return;
          }
          this.state = 'reading';
          transaction = database.transaction(names, 'readonly');
          const batches: unknown[][] = [];
          let hasFiles = false;
          transaction.onabort = () =>
            finish(transaction?.error ?? new Error(`Legacy read from ${this.name} aborted`));
          transaction.oncomplete = () => finish(undefined, { hasFiles, files: batches.flat() });
          for (const name of names) {
            const store = transaction.objectStore(name);
            if (this.mode === 'probe') {
              const count = store.count();
              count.onsuccess = () => {
                if (this.state === 'reading') hasFiles ||= count.result > 0;
              };
            } else {
              const read = store.getAll();
              read.onsuccess = () => {
                if (this.state !== 'reading') return;
                const files = read.result as unknown[];
                hasFiles ||= files.length > 0;
                batches.push(files);
              };
            }
          }
        } catch (error) {
          finish(error);
        }
      };
    });
    return this.completion;
  }
}
