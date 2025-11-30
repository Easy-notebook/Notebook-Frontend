import { Cell as StoreCell } from '@Store/models';
import useStore from '@Store/notebookStore';
import { BaseCellViewModel } from '../../model/BaseCellViewModel';

export class ImageCellViewModel extends BaseCellViewModel {
  // Local state
  public imageError = false;
  public tempContent = '';
  public elapsedTime = 0;
  public inputRef: React.RefObject<HTMLInputElement> | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(cell: StoreCell) {
    super(cell);
    this.tempContent = cell.content;
    this.initializeTimer();
  }

  private initializeTimer() {
    if (this.shouldShowLoading && !this.generationError) {
      const startTime = this.generationStartTime || Date.now();
      const update = () => {
        this.elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        this.notify();
      };
      update();
      this.timer = setInterval(update, 1000);
    } else {
      this.elapsedTime = 0;
    }
  }

  public updateProps(cell: StoreCell) {
    const prevCell = this.cell;
    super.updateProps(cell);

    // Update tempContent if not editing
    if (!this.isEditing && prevCell.content !== cell.content) {
      this.tempContent = cell.content;
      this.notify();
    }

    // Re-initialize timer if generation state changes
    if (
      prevCell.metadata?.isGenerating !== cell.metadata?.isGenerating ||
      prevCell.metadata?.generationError !== cell.metadata?.generationError
    ) {
      if (this.timer) clearInterval(this.timer);
      this.initializeTimer();
      this.notify();
    }
  }

  public dispose() {
    if (this.timer) clearInterval(this.timer);
  }

  // Getters
  get isGenerating() {
    return this.cell.metadata?.isGenerating || false;
  }

  get generationType() {
    return this.cell.metadata?.generationType || 'image';
  }

  get generationPrompt() {
    return this.cell.metadata?.prompt || '';
  }

  get generationParams() {
    return this.cell.metadata?.generationParams || {};
  }

  get generationStartTime() {
    return this.cell.metadata?.generationStartTime;
  }

  get generationError() {
    return this.cell.metadata?.generationError;
  }

  get generationStatus() {
    return this.cell.metadata?.generationStatus;
  }

  get hasContent() {
    return (this.cell.content || '').trim().length > 0;
  }

  get shouldShowLoading() {
    return (
      this.isGenerating ||
      (this.cell.metadata?.generationType && !this.hasContent && !this.generationError)
    );
  }

  get cellShowButtons() {
    return useStore.getState().showButtons[this.cell.id] || false;
  }

  get viewMode() {
    return useStore.getState().viewMode;
  }

  get imageData() {
    return this.parseMarkdown(this.cell.content);
  }

  get previewData() {
    return this.parseMarkdown(this.tempContent);
  }

  // Actions
  public setInputRef(ref: React.RefObject<HTMLInputElement>) {
    this.inputRef = ref;
  }

  public setImageError(error: boolean) {
    this.imageError = error;
    this.notify();
  }

  public setTempContent(content: string) {
    this.tempContent = content;
    this.notify();
  }

  public setShowButtons(show: boolean) {
    useStore.getState().setShowButtons(this.cell.id, show);
  }

  public startEditing = () => {
    if (this.viewMode !== 'create') return;
    useStore.getState().setEditingCellId(this.cell.id);
    this.tempContent = this.cell.content;
    this.notify();

    setTimeout(() => {
      if (this.inputRef?.current) {
        this.inputRef.current.focus();
        const length = this.cell.content.length;
        this.inputRef.current.setSelectionRange(length, length);
      }
    }, 0);
  };

  public saveEdit = () => {
    useStore.getState().updateCell(this.cell.id, this.tempContent);
    useStore.getState().setEditingCellId(null);
  };

  public cancelEdit = () => {
    this.tempContent = this.cell.content;
    useStore.getState().setEditingCellId(null);
    this.notify();
  };

  public handleClearError = () => {
    const newMetadata = {
      ...this.cell.metadata,
      isGenerating: false,
      generationError: undefined,
      generationStatus: undefined,
    };
    useStore.getState().updateCellMetadata(this.cell.id, newMetadata);
  };

  public handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.saveEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit();
    }
  };

  public handleBlur = () => {
    if (this.isEditing) {
      this.saveEdit();
    }
  };

  // Helpers
  private parseMarkdown(markdownStr: string) {
    const match = markdownStr.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (match) {
      const src = match[2] || '';
      const alt = match[1] || '';
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
      const isVideo = videoExtensions.some((ext) => src.toLowerCase().includes(ext));
      return { alt, src, isValid: true, isVideo };
    }
    return { alt: '', src: '', isValid: false, isVideo: false };
  }

  public formatElapsedTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }
}
