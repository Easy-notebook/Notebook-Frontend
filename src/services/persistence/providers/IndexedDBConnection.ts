type ConnectionState =
  | { kind: 'closed' }
  | { kind: 'opening'; promise: Promise<void>; reject: (error: Error) => void }
  | { kind: 'ready'; db: IDBDatabase }
  | { kind: 'closing'; promise: Promise<void> }
  | { kind: 'failed'; error: Error };

/** Owns connection admission and the lifetime of every accepted transaction. */
export class IndexedDBConnection {
  private state: ConnectionState = { kind: 'closed' };
  private generation = 0;
  private readonly transactions = new Set<Promise<unknown>>();

  constructor(
    private readonly name: string,
    private readonly version: number,
    private readonly upgrade: (db: IDBDatabase, transaction: IDBTransaction) => void,
    private readonly factory?: IDBFactory
  ) {}

  initialize(): Promise<void> {
    if (this.state.kind === 'ready') return Promise.resolve();
    if (this.state.kind === 'opening') return this.state.promise;
    if (this.state.kind === 'closing') {
      return Promise.reject(new Error('Storage connection is closing'));
    }

    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    const opening: ConnectionState = { kind: 'opening', promise, reject };
    this.state = opening;
    const fail = (error: Error) => {
      if (this.state !== opening) return;
      this.state = { kind: 'failed', error };
      reject(error);
    };

    try {
      const request = (this.factory ?? indexedDB).open(this.name, this.version);
      request.onerror = () => fail(request.error ?? new Error('Storage connection failed'));
      request.onblocked = () => fail(new Error('Storage upgrade blocked by another connection'));
      request.onupgradeneeded = () => {
        if (this.state !== opening) {
          request.transaction?.abort();
          return;
        }
        try {
          if (!request.transaction) throw new Error('Missing database upgrade transaction');
          this.upgrade(request.result, request.transaction);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
          request.transaction?.abort();
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (this.state !== opening) {
          // Open requests cannot be cancelled. A late result never acquires ownership.
          db.close();
          return;
        }
        const ready: ConnectionState = { kind: 'ready', db };
        this.state = ready;
        db.onclose = () => {
          if (this.state === ready) {
            this.generation++;
            this.state = { kind: 'closed' };
          }
        };
        db.onversionchange = () => {
          if (this.state === ready) void this.close();
        };
        resolve();
      };
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
    return promise;
  }

  close(): Promise<void> {
    const previous = this.state;
    if (previous.kind === 'closing') return previous.promise;
    if (previous.kind === 'closed') return Promise.resolve();

    this.generation++;
    const promise = Promise.allSettled([...this.transactions]).then(() => {
      if (this.state === closing) this.state = { kind: 'closed' };
    });
    const closing: ConnectionState = { kind: 'closing', promise };
    this.state = closing;
    if (previous.kind === 'opening') {
      previous.reject(new Error('Storage connection closed during initialization'));
    } else if (previous.kind === 'ready') {
      // IndexedDB closes after existing transactions finish; no new ones may start.
      previous.db.close();
    }
    return promise;
  }

  async runTransaction<T = void>(
    stores: string[],
    mode: IDBTransactionMode,
    schedule: (transaction: IDBTransaction, result: (value: T) => void) => void | Promise<void>
  ): Promise<T> {
    const generation = this.generation;
    const opening = this.initialize();
    await opening;
    const state = this.state;
    if (generation !== this.generation || state.kind !== 'ready') {
      throw new Error('Storage connection closed before transaction admission');
    }
    // No await between admission, transaction creation, and lifetime registration.
    const tx = state.db.transaction(stores, mode);
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    let value: T;
    let schedulingError: unknown;
    let hasSchedulingError = false;
    const completion = new Promise<T>((accept, fail) => {
      resolve = accept;
      reject = fail;
    });
    this.transactions.add(completion);
    const finish = () => this.transactions.delete(completion);
    tx.oncomplete = () => {
      finish();
      if (hasSchedulingError) reject(schedulingError);
      else resolve(value);
    };
    tx.onabort = () => {
      finish();
      reject(
        hasSchedulingError
          ? schedulingError
          : (tx.error ?? new Error('Storage transaction aborted'))
      );
    };
    const abort = (error: unknown) => {
      schedulingError = error;
      hasSchedulingError = true;
      try {
        tx.abort();
      } catch {
        // The transaction already terminated; rejecting cannot undo a prior commit.
        finish();
        reject(error);
      }
    };
    try {
      const scheduled = schedule(tx, (result) => {
        value = result;
      });
      if (scheduled) void scheduled.catch(abort);
    } catch (error) {
      abort(error);
    }
    return completion;
  }
}
