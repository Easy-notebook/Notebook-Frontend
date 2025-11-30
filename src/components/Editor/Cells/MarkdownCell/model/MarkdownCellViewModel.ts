import { EditorView, keymap } from '@codemirror/view';
import { Cell as StoreCell, OutputItem, CellType } from '@Store/models';
import useStore from '@Store/notebookStore';
import { v4 as uuidv4 } from 'uuid';
import { BaseCellViewModel } from '../../model/BaseCellViewModel';

export class MarkdownCellViewModel extends BaseCellViewModel {
  // Properties
  public editorRef: EditorView | null = null;

  // Keymap for boundary navigation
  public boundaryKeymap: any;

  constructor(cell: StoreCell) {
    super(cell);
    this.boundaryKeymap = this.createBoundaryKeymap();
  }

  public updateProps(cell: StoreCell) {
    super.updateProps(cell);
  }

  // Getters
  get hasContent() {
    return (this.cell.content || '').trim().length > 0;
  }

  get cellShowButtons() {
    return useStore.getState().showButtons[this.cell.id] || false;
  }

  // Actions
  public setEditorRef = (view: EditorView) => {
    this.editorRef = view;
    // Debug info
    setTimeout(() => {
      if (this.editorRef) {
        console.log('Editor ready:', {
          lines: this.editorRef.state.doc.lines,
          length: this.editorRef.state.doc.length,
          selection: this.editorRef.state.selection.main,
        });
      }
    }, 50);
  };

  public setShowButtons = (show: boolean) => {
    useStore.getState().setShowButtons(this.cell.id, show);
  };

  public createNewMarkdownCell = (afterIndex: number) => {
    const state = useStore.getState();
    const newCellId = uuidv4();
    const newCell: Partial<StoreCell> = {
      id: newCellId,
      type: 'markdown' as CellType,
      content: '',
      outputs: [] as OutputItem[],
      enableEdit: true,
    };
    state.addCell(newCell, afterIndex + 1);
    state.setEditingCellId(newCellId);
    return newCellId;
  };

  public createNewCodeCell = (content: string, afterIndex: number, codeIdentifier?: string) => {
    const state = useStore.getState();
    const newCellId = uuidv4();
    const newCell: Partial<StoreCell> = {
      id: newCellId,
      type: 'code' as CellType,
      content: content.trim(),
      outputs: [] as OutputItem[],
      enableEdit: true,
      metadata: { ...(this.cell.metadata || {}), language: codeIdentifier || 'python' },
    };
    state.addCell(newCell, afterIndex + 1);
    state.setCurrentCell(newCellId);
    state.setEditingCellId(null);

    if (this.editorRef) {
      this.editorRef.scrollDOM.scrollTop = this.editorRef.scrollDOM.scrollHeight;
    }
    return newCellId;
  };

  private isEmptyMarkdownCell = (content: string) => content.trim() === '';

  public handleChange = (value: string) => {
    const state = useStore.getState();
    const cells = state.cells;
    const currentIndex = cells.findIndex((c) => c.id === this.cell.id);
    const lines = value.split('\n');

    // ```lang code block splitting
    for (let i = lines.length - 1; i >= 0; i--) {
      const currentLine = lines[i];
      if (currentLine.startsWith('```') && currentLine.length > 3 && i < lines.length - 1) {
        const beforeBackticks = lines.slice(0, i).join('\n');
        const codeIdentifier = currentLine.slice(3).trim();
        const codeContent = lines.slice(i + 1).join('\n');

        if (this.isEmptyMarkdownCell(beforeBackticks)) {
          this.createNewCodeCell(codeContent, currentIndex, codeIdentifier);
          state.deleteCell(this.cell.id);
        } else {
          state.updateCell(this.cell.id, beforeBackticks.trim());
          this.createNewCodeCell(codeContent, currentIndex, codeIdentifier);
        }
        return;
      }
    }

    // Auto-create markdown cell after heading + empty line
    if (
      lines.length >= 2 &&
      /^#{1,6}\s+.+/.test(lines[lines.length - 2]) &&
      lines[lines.length - 1].trim() === ''
    ) {
      state.updateCell(this.cell.id, value);
      this.createNewMarkdownCell(currentIndex);
      return;
    }

    state.updateCell(this.cell.id, value);
  };

  public handleKeyDown = (event: React.KeyboardEvent) => {
    const state = useStore.getState();
    const cells = state.cells;
    const currentIndex = cells.findIndex((c) => c.id === this.cell.id);

    if (event.ctrlKey && event.key === 'Enter') {
      this.toggleEditing();
      return;
    }

    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      this.createNewMarkdownCell(currentIndex);
      return;
    }

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.navigateToSibling(event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }

    if (!this.isEditing && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.navigateToSibling(event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
  };

  public handleBlur = () => {
    if (this.isEditing) {
      useStore.getState().setEditingCellId(null);
    }
  };

  private createBoundaryKeymap() {
    return keymap.of([
      {
        key: 'ArrowDown',
        run: (view) => {
          const sel = view.state.selection.main;
          if (!sel.empty) return false;
          const line = view.state.doc.lineAt(sel.head);
          if (line.number === view.state.doc.lines && sel.head === line.to) {
            this.navigateToSibling('down');
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowUp',
        run: (view) => {
          const sel = view.state.selection.main;
          if (!sel.empty) return false;
          const line = view.state.doc.lineAt(sel.head);
          if (line.number === 1 && sel.head === line.from) {
            this.navigateToSibling('up');
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowRight',
        run: (view) => {
          const sel = view.state.selection.main;
          if (!sel.empty) return false;
          const atDocEnd = sel.head === view.state.doc.length;
          const line = view.state.doc.lineAt(sel.head);
          const atLastLineEnd = line.number === view.state.doc.lines && sel.head === line.to;
          if (atDocEnd || atLastLineEnd) {
            this.navigateToSibling('down');
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowLeft',
        run: (view) => {
          const sel = view.state.selection.main;
          if (!sel.empty) return false;
          const atDocStart = sel.head === 0;
          const line = view.state.doc.lineAt(sel.head);
          const atFirstLineStart = line.number === 1 && sel.head === line.from;
          if (atDocStart || atFirstLineStart) {
            this.navigateToSibling('up');
            return true;
          }
          return false;
        },
      },
    ]);
  }
}
