import { NativeStudyClient } from './NativeStudyClient';
import { NotebookSnapshotDocument } from '@Services/autoSave/NotebookSnapshotDocument';
import { PersistenceService } from '@Services/persistence/PersistenceService';
import type { IPersistenceService } from '@Services/persistence/interfaces';

/** Create a local editor document before navigation; no Python kernel is involved. */
export class NativeStudyNotebook {
  private readonly id = crypto.randomUUID();
  private creation: Promise<string> | null = null;
  constructor(private readonly persistence: IPersistenceService = new PersistenceService()) {}
  create(): Promise<string> {
    if (!this.creation)
      this.creation = this.save().catch((error) => {
        this.creation = null;
        throw error;
      });
    return this.creation;
  }
  private async save(): Promise<string> {
    await new NativeStudyClient(this.id).state();
    const document = new NotebookSnapshotDocument({
      notebookId: this.id,
      notebookTitle: '房屋特征研究',
      cells: [
        {
          id: crypto.randomUUID(),
          type: 'markdown',
          content: '# 房屋特征研究',
        },
        {
          id: crypto.randomUUID(),
          type: 'markdown',
          content: '在「房屋研究」中保存参考 CSV，运行分群并比较新样本。',
        },
      ],
      tasks: [],
      timestamp: Date.now(),
    });
    await this.persistence.initialize();
    await this.persistence.notebooks.saveNotebookSnapshot(document.file, document.notebook);
    return this.id;
  }
}
