/** Validated file accounting; transaction owners decide when to persist the result. */
export class NotebookFileTotals {
  constructor(
    private readonly fileCount: number,
    private readonly totalSize: number
  ) {
    NotebookFileTotals.nonnegative(fileCount);
    NotebookFileTotals.nonnegative(totalSize);
  }

  static size(value: unknown): number {
    return NotebookFileTotals.nonnegative(value);
  }

  static fromFiles(files: readonly { size: unknown }[]): NotebookFileTotals {
    let total = 0;
    for (const file of files) {
      total = NotebookFileTotals.nonnegative(total + NotebookFileTotals.size(file.size));
    }
    return new NotebookFileTotals(files.length, total);
  }

  adjust(deltaCount: number, deltaBytes: number): NotebookFileTotals {
    if (!Number.isSafeInteger(deltaCount) || !Number.isSafeInteger(deltaBytes))
      throw new Error('Invalid notebook file accounting delta');
    const count = this.fileCount + deltaCount;
    const bytes = this.totalSize + deltaBytes;
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(bytes))
      throw new Error('Notebook file accounting overflow');
    // Preserve the public adjustment contract for valid decrements below zero.
    return new NotebookFileTotals(Math.max(0, count), Math.max(0, bytes));
  }

  toRecord(): { fileCount: number; totalSize: number } {
    return { fileCount: this.fileCount, totalSize: this.totalSize };
  }

  private static nonnegative(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      throw new Error('Invalid notebook file accounting value');
    return value;
  }
}
