import { v4 as uuid } from 'uuid';
import type { NotebookActivityEntity } from '../../../storage/schema';

/** An append-only event; its identity is independent of clock resolution and file path. */
export class NotebookActivityRecord implements NotebookActivityEntity {
  readonly id: string;

  constructor(
    readonly notebookId: string,
    readonly activityType: NotebookActivityEntity['activityType'],
    readonly timestamp: number,
    readonly filePath?: string,
    readonly metadata?: NotebookActivityEntity['metadata']
  ) {
    this.id = `${notebookId}::${uuid()}`;
  }
}
