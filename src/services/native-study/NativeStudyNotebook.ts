import { NativeStudyClient } from './NativeStudyClient';
import { NotebookSnapshotDocument } from '@Services/autoSave/NotebookSnapshotDocument';
import { PersistenceService } from '@Services/persistence/PersistenceService';
import type { IPersistenceService } from '@Services/persistence/interfaces';
import { housingCellExample } from '@Services/notebook/housingCellExample';

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
          content:
            '在「房屋研究」中保存参考 CSV，运行分群并比较新样本。下方 AAL 单元格可独立运行 Rust 分群示例；每次运行使用独立局部状态；可通过 notebook_get/notebook_set 显式共享已提交的数据。',
        },
        {
          id: crypto.randomUUID(),
          type: 'code',
          language: 'aal',
          content: housingCellExample,
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
