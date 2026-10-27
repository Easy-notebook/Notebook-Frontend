export interface AccessHistoryRecord {
  accessCount: number;
  lastAccessedAt: number;
}

/** Immutable access history; repositories retain transaction and persistence ownership. */
export class AccessHistory {
  constructor(private readonly record: AccessHistoryRecord) {
    if (
      !Number.isSafeInteger(record.accessCount) ||
      record.accessCount < 0 ||
      !Number.isSafeInteger(record.lastAccessedAt) ||
      record.lastAccessedAt < 0
    )
      throw new Error('Invalid storage access history');
    this.record = { accessCount: record.accessCount, lastAccessedAt: record.lastAccessedAt };
  }

  accessedAt(timestamp: number): AccessHistory {
    if (this.record.accessCount === Number.MAX_SAFE_INTEGER)
      throw new Error('Storage access count overflow');
    return new AccessHistory({
      accessCount: this.record.accessCount + 1,
      lastAccessedAt: timestamp,
    });
  }

  merge(other: AccessHistory): AccessHistory {
    return new AccessHistory({
      accessCount: Math.max(this.record.accessCount, other.record.accessCount),
      lastAccessedAt: Math.max(this.record.lastAccessedAt, other.record.lastAccessedAt),
    });
  }

  observedAt(timestamp: number): AccessHistory {
    return new AccessHistory({ ...this.record, lastAccessedAt: timestamp });
  }

  toRecord(): AccessHistoryRecord {
    return { ...this.record };
  }
}
