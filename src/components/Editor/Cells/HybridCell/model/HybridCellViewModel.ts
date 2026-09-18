import { Cell as StoreCell } from '@Store/models';
import useStore from '@Store/notebookStore';
import { BaseCellViewModel } from '../../model/BaseCellViewModel';

export class HybridCellViewModel extends BaseCellViewModel {
  // Local state
  public isProcessing = false;

  constructor(cell: StoreCell) {
    super(cell);
  }

  // Getters
  get contentType() {
    const lines = this.cell.content.split('\n');
    const codeBlockRegex = /^```(\w+)?$/;

    for (let i = 0; i < lines.length; i++) {
      if (codeBlockRegex.test(lines[i].trim())) {
        const language = lines[i].trim().slice(3);
        let content = '';
        let j = i + 1;

        while (j < lines.length && !codeBlockRegex.test(lines[j].trim())) {
          content += lines[j] + '\n';
          j++;
        }

        return {
          type: 'code',
          language: language || 'javascript',
          content: content.trim(),
        };
      }
    }

    return {
      type: 'markdown',
      content: this.cell.content,
    };
  }

  get isCurrentCell() {
    return useStore.getState().currentCellId === this.cell.id;
  }

  // Actions
  public setIsProcessing(isProcessing: boolean) {
    this.isProcessing = isProcessing;
    this.notify();
  }

  public handleContentChange = (value: string) => {
    useStore.getState().updateCell(this.cell.id, value);
  };
}
