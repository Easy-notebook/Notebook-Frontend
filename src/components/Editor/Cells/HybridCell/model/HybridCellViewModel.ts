import { Cell as StoreCell } from '@Store/models';
import useStore from '@Store/notebookStore';
import { BaseCellViewModel } from '../../model/BaseCellViewModel';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { getCellById } from '@Store/models/cellIndex';
import {
  firstExecutableFence,
  replaceFencedCode,
  type FencedBlock,
} from '@Utils/markdown/fencedMarkdown';

export class HybridCellViewModel extends BaseCellViewModel {
  private parsedSource?: string;
  private parsedFence?: FencedBlock;

  private get fence(): FencedBlock | undefined {
    if (this.parsedSource !== this.cell.content) {
      this.parsedSource = this.cell.content;
      this.parsedFence = firstExecutableFence(this.cell.content);
    }
    return this.parsedFence;
  }

  constructor(cell: StoreCell) {
    super(cell);
  }

  // Getters
  get precedingMarkdown(): string {
    const fence = this.fence;
    return fence ? this.cell.content.slice(0, fence.start) : '';
  }

  get followingMarkdown(): string {
    const fence = this.fence;
    return fence ? this.cell.content.slice(fence.end) : '';
  }

  get contentType() {
    const fence = this.fence;
    if (fence)
      return {
        type: 'code',
        language: normalizeCodeLanguage(fence.language),
        content: fence.code,
      };

    return {
      type: 'markdown',
      content: this.cell.content,
    };
  }

  // Actions
  public handleContentChange = (value: string) => {
    const editingFence = this.fence !== undefined;
    const state = useStore.getState();
    const latest = getCellById(state.cells, this.cell.id);
    if (!latest || latest.type !== 'hybrid') return;
    this.updateProps(latest);
    const fence = this.fence;
    // A callback belongs to either the Markdown surface or its code editor.
    // Never reinterpret one surface's buffer after the other replaces it.
    if (editingFence !== (fence !== undefined)) return;
    if (value === (fence ? fence.code : this.cell.content)) return;
    const content = fence
      ? this.cell.content.slice(0, fence.start) +
        replaceFencedCode(fence, value) +
        this.cell.content.slice(fence.end)
      : value;
    state.updateCell(this.cell.id, content);
  };
}
