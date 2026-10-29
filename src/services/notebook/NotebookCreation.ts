import { NotebookSnapshotDocument } from '@Services/autoSave/NotebookSnapshotDocument';
import { persistenceService } from '@Services/persistence/instance';
import type { IPersistenceService } from '@Services/persistence/interfaces';
import type { Cell } from '@Store/models';

/** Allocate and persist an editor document before navigation; runtime admission is separate. */
export class NotebookCreation {
  constructor(private readonly persistence: IPersistenceService = persistenceService) {}
  async create(title = 'Untitled', cells?: Cell[]): Promise<string> {
    const id = crypto.randomUUID();
    const document = new NotebookSnapshotDocument({
      notebookId: id,
      notebookTitle: title,
      cells: cells ?? [
        {
          id: crypto.randomUUID(),
          type: 'markdown',
          content: `# ${title}`,
          outputs: [],
          enableEdit: true,
          metadata: { isDefaultTitle: true },
        },
      ],
      tasks: [],
      timestamp: Date.now(),
    });
    await this.persistence.initialize();
    await this.persistence.notebooks.saveNotebookSnapshot(document.file, document.notebook);
    await this.persistence.tabs.saveTabState(id, [], null);
    return id;
  }
}
