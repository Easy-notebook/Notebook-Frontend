import type {
  FileContentEntity,
  FileMetadataEntity,
  NotebookEntity,
  SplitFileEntity,
} from './schema';

export interface ContentUsage {
  totalBytes: number;
  bytesByNotebook: ReadonlyMap<string, number>;
}

export interface StorageStats {
  totalNotebooks: number;
  totalFiles: number;
  /** Logical file sizes, including remote references; not physical IndexedDB usage. */
  totalSize: number;
  largeFilesCount: number;
  oldestNotebook: number;
  newestNotebook: number;
  mostAccessedNotebook: string;
  /** UTF-8 bytes of stored content strings, including orphan content. */
  localContentBytes: number;
  splitContentBytes: number;
  /** Subset of the two content totals with no associated notebook/metadata. */
  orphanContentBytes: number;
  recoveryCopies: number;
  /** UTF-8 payload bytes; recovery copies are independent of notebook eviction. */
  recoveryContentBytes: number;
  recoveryBaselineBytes: number;
  /** Canonical, split and recovery text, excluding indexes/record metadata overhead. */
  totalContentBytes: number;
}

/** Aggregates one transaction snapshot without trusting denormalized notebook counters. */
export class StorageUsage {
  private readonly notebookIds: Set<string>;
  private readonly fileOwners: Map<string, string>;
  private readonly contentBytesByNotebook = new Map<string, number>();
  private readonly encoder = new TextEncoder();
  private readonly stats: Omit<StorageStats, 'totalContentBytes'>;

  constructor(notebooks: NotebookEntity[], files: FileMetadataEntity[]) {
    this.notebookIds = new Set(notebooks.map((book) => book.id));
    this.fileOwners = new Map(files.map((file) => [file.id, file.notebookId]));
    const ownedFiles = files.filter((file) => this.notebookIds.has(file.notebookId));
    let oldest = Infinity;
    let newest = -Infinity;
    let mostAccessed: NotebookEntity | undefined;
    for (const book of notebooks) {
      oldest = Math.min(oldest, book.createdAt);
      newest = Math.max(newest, book.createdAt);
      if (
        !mostAccessed ||
        book.accessCount > mostAccessed.accessCount ||
        (book.accessCount === mostAccessed.accessCount &&
          (book.lastAccessedAt > mostAccessed.lastAccessedAt ||
            (book.lastAccessedAt === mostAccessed.lastAccessedAt && book.id < mostAccessed.id)))
      ) {
        mostAccessed = book;
      }
    }
    this.stats = {
      totalNotebooks: notebooks.length,
      totalFiles: ownedFiles.length,
      totalSize: ownedFiles.reduce((sum, file) => sum + file.size, 0),
      largeFilesCount: ownedFiles.filter((file) => file.isLargeFile).length,
      oldestNotebook: notebooks.length ? oldest : 0,
      newestNotebook: notebooks.length ? newest : 0,
      mostAccessedNotebook: mostAccessed?.id ?? '',
      localContentBytes: 0,
      splitContentBytes: 0,
      orphanContentBytes: 0,
      recoveryCopies: 0,
      recoveryContentBytes: 0,
      recoveryBaselineBytes: 0,
    };
  }

  addFileContent(content: FileContentEntity): void {
    const bytes = this.encoder.encode(content.content).byteLength;
    this.stats.localContentBytes += bytes;
    const owner = this.fileOwners.get(content.fileId);
    if (owner === undefined || !this.notebookIds.has(owner)) this.stats.orphanContentBytes += bytes;
    else this.recordOwnedBytes(owner, bytes);
  }

  addSplitContent(content: SplitFileEntity): void {
    const bytes = this.encoder.encode(content.content).byteLength;
    this.stats.splitContentBytes += bytes;
    if (!this.notebookIds.has(content.notebookId)) this.stats.orphanContentBytes += bytes;
    else this.recordOwnedBytes(content.notebookId, bytes);
  }

  addRecoveryContent(record: { content: string; expectedContent: string | null }): void {
    if (
      typeof record.content !== 'string' ||
      (record.expectedContent !== null && typeof record.expectedContent !== 'string')
    ) {
      throw new Error('Invalid recovery content while measuring storage');
    }
    this.stats.recoveryCopies++;
    this.stats.recoveryContentBytes += this.encoder.encode(record.content).byteLength;
    this.stats.recoveryBaselineBytes +=
      record.expectedContent === null ? 0 : this.encoder.encode(record.expectedContent).byteLength;
    // Recovery survives deleting its original notebook; do not credit its bytes to eviction.
  }

  private get totalContentBytes(): number {
    return (
      this.stats.localContentBytes +
      this.stats.splitContentBytes +
      this.stats.recoveryContentBytes +
      this.stats.recoveryBaselineBytes
    );
  }

  private recordOwnedBytes(notebookId: string, bytes: number): void {
    this.contentBytesByNotebook.set(
      notebookId,
      (this.contentBytesByNotebook.get(notebookId) ?? 0) + bytes
    );
  }

  toContentUsage(): ContentUsage {
    return {
      totalBytes: this.totalContentBytes,
      bytesByNotebook: new Map(this.contentBytesByNotebook),
    };
  }

  toStats(): StorageStats {
    return { ...this.stats, totalContentBytes: this.totalContentBytes };
  }
}
