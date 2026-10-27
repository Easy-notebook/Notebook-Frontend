export type NotebookConflictReason = 'content_changed' | 'empty_overwrite';

/** A semantic write conflict; retrying unchanged input cannot resolve its edit basis. */
export class NotebookConflictError extends Error {
  readonly name = 'NotebookConflictError';

  constructor(
    readonly notebookId: string,
    readonly filePath: string,
    readonly reason: NotebookConflictReason = 'content_changed',
    readonly recoveryError?: unknown
  ) {
    super(
      reason === 'content_changed'
        ? 'Notebook content changed before snapshot commit'
        : 'Refusing to overwrite an existing notebook with an empty snapshot'
    );
    if (recoveryError !== undefined) {
      this.message += `; conflict recovery could not be saved: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`;
    }
  }
}
