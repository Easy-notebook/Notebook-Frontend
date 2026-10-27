interface HistorySnapshot<T> {
  readonly value: T;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

function immutableCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    for (const child of Object.values(item)) freeze(child);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}

/** One committed grid snapshot per command, with bounded undo and explicit redo branching. */
export class SpreadsheetHistory<T> {
  private frames: T[];
  private position = 0;
  private snapshot: HistorySnapshot<T>;
  private readonly listeners = new Set<() => void>();

  constructor(
    initial: T,
    private readonly onChange: () => void,
    private readonly undoLimit = 50
  ) {
    if (!Number.isInteger(undoLimit) || undoLimit < 1) throw new Error('Invalid history limit');
    this.frames = [immutableCopy(initial)];
    this.snapshot = this.project();
  }

  getSnapshot = (): HistorySnapshot<T> => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  reset(value: T): void {
    this.frames = [immutableCopy(value)];
    this.position = 0;
    this.publish();
  }

  commit(value: T): void {
    const next = immutableCopy(value);
    this.frames = [...this.frames.slice(0, this.position + 1), next].slice(-(this.undoLimit + 1));
    this.position = this.frames.length - 1;
    this.publish();
  }

  undo(): boolean {
    if (this.position === 0) return false;
    this.position--;
    this.publish();
    return true;
  }

  redo(): boolean {
    if (this.position === this.frames.length - 1) return false;
    this.position++;
    this.publish();
    return true;
  }

  private project(): HistorySnapshot<T> {
    return Object.freeze({
      value: this.frames[this.position],
      canUndo: this.position > 0,
      canRedo: this.position < this.frames.length - 1,
    });
  }

  private publish(): void {
    // Revoke pending edit/save acknowledgements before notifying React or other observers.
    this.onChange();
    this.snapshot = this.project();
    for (const listener of this.listeners) listener();
  }
}
