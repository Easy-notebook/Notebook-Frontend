import { EditorView, keymap } from '@codemirror/view';
import { Cell as StoreCell, OutputItem, CellType } from '@Store/models';
import useStore from '@Store/notebookStore';
import { v4 as uuidv4 } from 'uuid';
import { BaseCellViewModel } from '../../model/BaseCellViewModel';

import { debounce } from 'lodash-es';
import { getCellById, getCellIndexById } from '@Store/models/cellIndex';
import { isCompositionInput } from '../../../utils/compositionInput';

export class MarkdownCellViewModel extends BaseCellViewModel {
  // Properties
  public editorRef: EditorView | null = null;
  public localContent = '';
  private debouncedUpdate: ((value: string) => void) & { cancel(): void; flush(): void };
  private lastPublishedContent: string | undefined;

  // Keymap for boundary navigation
  public boundaryKeymap: ReturnType<typeof keymap.of>;

  constructor(cell: StoreCell) {
    super(cell);
    this.localContent = cell.content || '';
    this.boundaryKeymap = this.createBoundaryKeymap();

    this.debouncedUpdate = debounce((value: string) => {
      const state = useStore.getState();
      const current = getCellById(state.cells, cell.id);
      if (current?.type === 'markdown' && current.content !== value) {
        this.lastPublishedContent = value;
        state.updateCell(cell.id, value);
      }
    }, 300, { maxWait: 1000 });
  }

  public updateProps(cell: StoreCell) {
    const prevContent = this.cell.content;
    const acknowledgesWrite = cell.content === this.lastPublishedContent;
    if (acknowledgesWrite) this.lastPublishedContent = undefined;
    super.updateProps(cell);

    // Our preceding write can arrive after more typing; acknowledge it without
    // replacing the newer local buffer. A different external revision wins.
    if (!acknowledgesWrite && cell.content !== prevContent && cell.content !== this.localContent) {
      this.debouncedUpdate.cancel();
      this.lastPublishedContent = undefined;
      this.localContent = cell.content || '';
      // Force re-render if needed, though usually React handles this via prop change
      // But since we use localContent in the view, we might need to notify
      this.notify();
    }
  }

  // Getters
  get hasContent() {
    return (this.localContent || '').trim().length > 0;
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
    this.flushPendingChanges();
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

  /** CodeMirror edits this cell's literal Markdown; gestures own structural changes. */
  public handleChange = (value: string) => {
    if (value === this.localContent) return;
    this.localContent = value;
    this.debouncedUpdate(value);
  };

  public handleKeyDown = (event: React.KeyboardEvent) => {
    if (isCompositionInput(event.nativeEvent)) return;
    if (event.key !== 'Enter' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const state = useStore.getState();
    const cells = state.cells;
    const currentIndex = getCellIndexById(cells, this.cell.id) ?? -1;
    if (currentIndex === -1) return;

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.flushPendingChanges();
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

    // Special handling for Title cell (first cell): Enter creates a new cell instead of newline
    if (
      currentIndex === 0 &&
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      this.createNewMarkdownCell(currentIndex);
      return;
    }

    if (!this.isEditing && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.navigateToSibling(event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
  };

  public handleBlur = () => {
    this.flushPendingChanges();
    if (this.isEditing) {
      useStore.getState().setEditingCellId(null);
    }
  };

  public flushPendingChanges = () => {
    this.debouncedUpdate.flush();
    this.debouncedUpdate.cancel();
  };

  public override navigateToSibling(direction: 'up' | 'down') {
    this.flushPendingChanges();
    super.navigateToSibling(direction);
  }

  private createBoundaryKeymap() {
    return keymap.of([
      {
        key: 'ArrowDown',
        run: (view) => {
          if (view.composing) return false;
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
          if (view.composing) return false;
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
          if (view.composing) return false;
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
          if (view.composing) return false;
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
