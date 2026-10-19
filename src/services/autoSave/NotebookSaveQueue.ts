import type { NotebookSnapshot, NotebookSaveProgress } from './types';

export type QueuedSnapshot = NotebookSnapshot & { readonly revision: number };
interface Barrier {
  revision: number;
  resolve: () => void;
  reject: (error: unknown) => void;
}
interface Entry {
  progress: NotebookSaveProgress;
  snapshot: QueuedSnapshot | null;
  barriers: Set<Barrier>;
}

/** Owns per-notebook save transitions and acknowledgements; performs no I/O. */
export class NotebookSaveQueue {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Set<string>();
  private revision = 0;

  get size(): number {
    return this.pending.size;
  }
  keys(): IterableIterator<string> {
    return this.pending.keys();
  }
  has(id: string): boolean {
    return this.pending.has(id);
  }
  get(id: string): QueuedSnapshot | undefined {
    return this.entries.get(id)?.snapshot ?? undefined;
  }
  progress(id: string): NotebookSaveProgress | null {
    return this.entries.get(id)?.progress ?? null;
  }

  enqueue(snapshot: NotebookSnapshot): QueuedSnapshot {
    const previous = this.entries.get(snapshot.notebookId);
    // A revision owns its accepted data across debounce, retries and conflict recovery.
    // Clone before changing queue state so rejected input cannot replace an accepted edit.
    const owned = structuredClone(snapshot);
    const queued = { ...owned, timestamp: Date.now(), revision: ++this.revision };
    this.entries.set(snapshot.notebookId, {
      snapshot: queued,
      barriers: previous?.barriers ?? new Set(),
      progress: Object.freeze({
        notebookId: snapshot.notebookId,
        currentRevision: queued.revision,
        committedRevision: previous?.progress.committedRevision ?? 0,
        inFlightRevision: previous?.progress.inFlightRevision ?? null,
        phase: previous?.progress.inFlightRevision ? 'writing' : 'scheduled',
        error: null,
      }),
    });
    this.pending.add(snapshot.notebookId);
    return queued;
  }

  begin(snapshot: QueuedSnapshot): void {
    const entry = this.require(snapshot.notebookId);
    if (entry.progress.inFlightRevision !== null || entry.snapshot !== snapshot) {
      throw new Error('Cannot start a stale or concurrent notebook write');
    }
    this.update(entry, { phase: 'writing', inFlightRevision: snapshot.revision, error: null });
  }

  acknowledge(snapshot: QueuedSnapshot): void {
    const entry = this.writing(snapshot);
    if (entry.snapshot?.revision === snapshot.revision) {
      entry.snapshot = null;
      this.pending.delete(snapshot.notebookId);
    }
    this.update(entry, {
      committedRevision: snapshot.revision,
      inFlightRevision: null,
      phase: entry.snapshot ? 'scheduled' : 'clean',
      error: null,
    });
    for (const barrier of entry.barriers) {
      if (barrier.revision <= snapshot.revision) {
        entry.barriers.delete(barrier);
        barrier.resolve();
      }
    }
  }

  fail(snapshot: QueuedSnapshot, error: unknown, exhausted: boolean, terminal = false): void {
    const entry = this.writing(snapshot);
    const superseded = entry.snapshot?.revision !== snapshot.revision;
    this.update(entry, {
      inFlightRevision: null,
      phase: terminal ? 'blocked' : superseded ? 'scheduled' : exhausted ? 'blocked' : 'retry_wait',
      error: error instanceof Error ? error.message : String(error),
    });
    if (terminal || (!superseded && exhausted)) {
      for (const barrier of entry.barriers) barrier.reject(error);
      entry.barriers.clear();
    }
  }

  createBarrier(id: string, revision: number): { completion: Promise<void>; pending: boolean } {
    const entry = this.entries.get(id);
    if (
      !entry ||
      !Number.isSafeInteger(revision) ||
      revision <= 0 ||
      revision > entry.progress.currentRevision
    ) {
      return {
        completion: Promise.reject(new Error('Unknown notebook save revision')),
        pending: false,
      };
    }
    if (revision <= entry.progress.committedRevision)
      return { completion: Promise.resolve(), pending: false };
    return {
      completion: new Promise<void>((resolve, reject) =>
        entry.barriers.add({ revision, resolve, reject })
      ),
      pending: true,
    };
  }

  discard(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.progress.inFlightRevision !== null)
      throw new Error('Cannot discard an in-flight notebook write');
    for (const barrier of entry.barriers)
      barrier.reject(new Error('Pending notebook save discarded'));
    this.entries.delete(id);
    this.pending.delete(id);
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      for (const barrier of entry.barriers) barrier.reject(new Error('Notebook save queue closed'));
    }
    this.entries.clear();
    this.pending.clear();
  }

  private require(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('Unknown notebook save');
    return entry;
  }
  private writing(snapshot: QueuedSnapshot): Entry {
    const entry = this.require(snapshot.notebookId);
    if (entry.progress.inFlightRevision !== snapshot.revision)
      throw new Error('Stale notebook write completion');
    return entry;
  }
  private update(entry: Entry, updates: Partial<NotebookSaveProgress>): void {
    entry.progress = Object.freeze({ ...entry.progress, ...updates });
  }
}
