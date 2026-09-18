import { Cell, Output, ReactCodeMirrorRef } from '../utils/types';
import useStore from '@Store/notebookStore';
import useCodeStore, { DISPLAY_MODES } from '@Store/codeStore';
import { processOutput } from '../utils/outputProcessing';
import { EXPAND_THRESHOLD } from '../utils';
import { debounce } from 'lodash-es';
import { BaseCellViewModel } from '../../model/BaseCellViewModel';

export class CodeCellViewModel extends BaseCellViewModel {
  // Properties from props
  private isDemoMode: boolean;

  // Local state
  public showThinking = true;
  public showToolbar = false;
  public isExpanded = true;
  public isUserToggled = false;
  public isHovering = false;
  public contentHeight = 0;
  public outputUpdateKey = 0;
  public outputVisible = false;

  // Refs (managed as properties)
  public editorRef: React.RefObject<ReactCodeMirrorRef> | null = null;
  public codeBlockWrapperRef: React.RefObject<HTMLDivElement> | null = null;
  public codeContainerRef: React.RefObject<HTMLDivElement> | null = null;
  private prevContent = '';
  public localContent = '';
  private debouncedUpdate: (value: string) => void;

  constructor(cell: Cell, _dslcMode = false, isDemoMode = false, isInDetachedView = false) {
    super(cell);
    this.isDemoMode = isDemoMode;
    this.prevContent = cell.content || '';

    // Initialize state based on props
    if (isInDetachedView) {
      this.isExpanded = true;
      this.isUserToggled = true;
    }

    // Initialize display mode for demo mode
    if (isDemoMode && !useCodeStore.getState().cellModes[cell.id]) {
      useCodeStore.getState().setCellMode(cell.id, DISPLAY_MODES.OUTPUT_ONLY);
    }

    this.localContent = cell.content || '';
    this.debouncedUpdate = debounce((value: string) => {
      useStore.getState().updateCell(this.cell.id, value);
    }, 300);
  }

  public updateProps(cell: Cell, isDemoMode: boolean) {
    const prevCell = this.cell;
    // Call super.updateProps to handle cell update and notification if needed,
    // but we have more complex logic here, so we might just update this.cell manually
    // or call super and then do the rest.
    // Since super.updateProps checks for cell equality, we can call it.
    // However, we need to update other props too.

    this.cell = cell; // Update local reference first for logic below
    this.isDemoMode = isDemoMode;

    // Handle content changes for expansion logic
    const currentContent = cell.content || '';
    const prevContentStr = this.prevContent || '';
    const contentDiff = Math.abs(currentContent.length - prevContentStr.length);

    if (contentDiff > 100 || (prevContentStr && !currentContent)) {
      this.isUserToggled = false;
      this.notify();
    }

    // Sync local content if it differs from prop and we are not currently typing (simple heuristic)
    if (cell.content !== this.prevContent) {
      this.localContent = cell.content || '';
      this.notify();
    }

    this.prevContent = currentContent;

    // Handle output changes for auto-expansion
    if (
      this.processedOutputs.length > 0 &&
      !this.isExpanded &&
      this.contentHeight > EXPAND_THRESHOLD
    ) {
      this.isExpanded = true;
      this.isUserToggled = true;
      this.notify();
    }

    // Handle output visibility
    const newOutputVisible = this.processedOutputs.length > 0;
    if (this.outputVisible !== newOutputVisible) {
      this.outputVisible = newOutputVisible;
      this.notify();
    }

    // Check if we need to notify due to other prop changes that affect derived state
    if (prevCell !== cell) {
      this.notify();
    }
  }

  public setRefs(
    editorRef: React.RefObject<ReactCodeMirrorRef>,
    codeBlockWrapperRef: React.RefObject<HTMLDivElement>,
    codeContainerRef: React.RefObject<HTMLDivElement>
  ) {
    this.editorRef = editorRef;
    this.codeBlockWrapperRef = codeBlockWrapperRef;
    this.codeContainerRef = codeContainerRef;
  }

  // Getters for derived state
  get isExecuting() {
    return useCodeStore.getState().getCellExecState(this.cell.id).isExecuting;
  }

  get isCancelling() {
    return useCodeStore.getState().getCellExecState(this.cell.id).isCancelling;
  }

  get elapsedTime() {
    return useCodeStore.getState().getCellExecState(this.cell.id).elapsedTime || 0;
  }

  get cellMode() {
    const storedMode = useCodeStore.getState().cellModes[this.cell.id];
    if (storedMode) return storedMode;

    if (this.cell.outputs && this.cell.outputs.length > 0) {
      return DISPLAY_MODES.OUTPUT_ONLY;
    }

    return this.isDemoMode ? DISPLAY_MODES.OUTPUT_ONLY : DISPLAY_MODES.COMPLETE;
  }

  get isDetached() {
    return useStore.getState().detachedCellId === this.cell.id;
  }

  get isCurrentCell() {
    return useStore.getState().currentCellId === this.cell.id;
  }

  get isDetachedCellFullscreen() {
    return useStore.getState().isDetachedCellFullscreen;
  }

  get showCellIds() {
    return useStore.getState().showCellIds;
  }

  get isDslcCommand() {
    if (!this.cell.content) return false;
    try {
      const content =
        typeof this.cell.content === 'string' ? this.cell.content : String(this.cell.content);
      if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
        const cmd = JSON.parse(content.trim());
        return cmd.dslc_command === true;
      }
    } catch {
      return false;
    }
    return false;
  }

  get showAIdebug() {
    return !!(
      this.cell.outputs &&
      this.cell.outputs.length > 0 &&
      this.cell.outputs[0].content === '[error-message-for-debug]'
    );
  }

  get processedOutputs() {
    if (this.cell.outputs && Array.isArray(this.cell.outputs)) {
      return this.cell.outputs
        .map(processOutput)
        .filter((o): o is Output => o !== null)
        .map((output) => ({
          ...output,
          key: output.key || `output-${Date.now()}-${Math.random()}`,
        }));
    }
    return [];
  }

  // Actions
  public setShowThinking(show: boolean) {
    this.showThinking = show;
    this.notify();
  }

  public setShowToolbar(show: boolean) {
    this.showToolbar = show;
    this.notify();
  }

  public setIsHovering(isHovering: boolean) {
    this.isHovering = isHovering;
    this.notify();
  }

  public setContentHeight(height: number) {
    this.contentHeight = height;
    if (!this.isUserToggled) {
      const newExpanded = height <= EXPAND_THRESHOLD;
      if (this.isExpanded !== newExpanded) {
        this.isExpanded = newExpanded;
        this.notify();
      }
    }
  }

  public incrementOutputUpdateKey() {
    this.outputUpdateKey += 1;
    this.notify();
  }

  // Store Actions
  public toggleDetachedCellFullscreen = () => {
    useStore.getState().toggleDetachedCellFullscreen();
    this.notify(); // Force re-render
  };

  public setDetachedCellId = (id: string | null) => {
    useStore.getState().setDetachedCellId(id);
    this.notify();
  };

  public setCellMode = (id: string, mode: string) => {
    // @ts-expect-error - mode type mismatch is expected
    useCodeStore.getState().setCellMode(id, mode);
    this.notify();
  };

  public execute = () => {
    useCodeStore.getState().executeCell(this.cell.id);
  };

  public cancel = () => {
    useCodeStore.getState().cancelCellExecution(this.cell.id);
  };

  public clearOutput = () => {
    useStore.getState().clearCellOutputs(this.cell.id);
  };

  public restart = () => {
    console.log(`Initializing kernel for cell ${this.cell.id}`);
    useStore.getState().clearAllOutputs();
    useCodeStore.getState().restartKernel();
  };

  public handleChange = (value: string) => {
    this.localContent = value;
    this.debouncedUpdate(value);
  };

  public copyCode = () => {
    navigator.clipboard.writeText(this.cell.content || '').then(
      () => {
        // Silent copy
      },
      (err) => {
        if (import.meta.env.DEV) {
          console.error('Copy failed:', err);
        }
      }
    );
  };

  public toggleCellMode = () => {
    let newMode;
    if (this.cellMode === DISPLAY_MODES.COMPLETE) {
      newMode = DISPLAY_MODES.CODE_ONLY;
    } else if (this.cellMode === DISPLAY_MODES.CODE_ONLY) {
      newMode = DISPLAY_MODES.OUTPUT_ONLY;
    } else {
      newMode = DISPLAY_MODES.COMPLETE;
    }
    this.setCellMode(this.cell.id, newMode);
  };

  public toggleDetached = () => {
    this.setDetachedCellId(this.isDetached ? null : this.cell.id);
  };

  public handleExpand = () => {
    this.isUserToggled = true;
    this.isExpanded = true;
    this.notify();
  };

  public handleCollapse = () => {
    this.isUserToggled = true;
    this.isExpanded = false;
    this.notify();

    if (this.codeContainerRef?.current) {
      setTimeout(() => {
        this.codeContainerRef?.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    }
  };

  // Navigation Logic
  public handleKeyDown = (event: React.KeyboardEvent) => {
    // Backspace at start of empty code cell
    if (event.key === 'Backspace' && !this.cell.content.trim()) {
      if (this.isCursorAtDocStart()) {
        event.preventDefault();
        const state = useStore.getState();
        state.updateCellType(this.cell.id, 'markdown');
        setTimeout(() => {
          state.setEditingCellId(this.cell.id);
        }, 50);
        return 'convert';
      }
    }

    // Ctrl+Enter: Execute
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      this.execute();
      return 'execute';
    }

    // Alt+Arrow: Navigate
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.navigateToSibling(event.key === 'ArrowUp' ? 'up' : 'down');
      return 'navigate';
    }

    // Arrow Up/Down: Cross-cell navigation
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const direction = event.key === 'ArrowUp' ? 'up' : 'down';
      // Only check cursor position if we are pressing up/down
      const isAtFirstLine = event.key === 'ArrowUp' && this.isCursorAtFirstLine();
      const isAtLastLine = event.key === 'ArrowDown' && this.isCursorAtLastLine();

      console.log('Arrow navigation check', { key: event.key, isAtFirstLine, isAtLastLine });

      if (isAtFirstLine || isAtLastLine) {
        // If we are at the top and pressing up, we should navigate to the previous cell
        const isAtStart = this.isCursorAtDocStart();
        if (direction === 'up' && isAtStart) {
          console.log('Navigating UP from CodeCell start');
          event.preventDefault();
          // Dispatch navigation event to parent (handled by useCodeCellViewModel or similar,
          // but here we want to trigger the standard cell navigation)
          // Actually, we can just use navigateToSibling which handles focusCell
          this.navigateToSibling(direction);
          return 'navigate';
        }

        // If we are at the bottom and pressing down
        const isAtEnd = this.isCursorAtDocEnd();
        if (direction === 'down' && isAtEnd) {
          console.log('Navigating DOWN from CodeCell end');
          event.preventDefault();
          this.navigateToSibling(direction);
          return 'navigate';
        }
      }
    }

    // Arrow Left/Right: Cross-cell navigation
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      // Optimization: Check key first before checking cursor position
      if (event.key === 'ArrowLeft' && this.isCursorAtDocStart()) {
        event.preventDefault();
        this.navigateToSibling('up');
        return 'navigate';
      }
      if (event.key === 'ArrowRight' && this.isCursorAtDocEnd()) {
        event.preventDefault();
        this.navigateToSibling('down');
        return 'navigate';
      }
    }

    return null;
  };

  // Cursor Helpers
  private getEditorState() {
    return this.editorRef?.current?.view?.state;
  }

  private isCursorAtFirstLine() {
    const state = this.getEditorState();
    if (!state) return false;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    return line.number === 1;
  }

  private isCursorAtLastLine() {
    const state = this.getEditorState();
    if (!state) return false;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    return line.number === state.doc.lines;
  }

  private isCursorAtDocStart() {
    const state = this.getEditorState();
    if (!state) return false;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    return cursorPos === line.from && line.number === 1;
  }

  private isCursorAtDocEnd() {
    const state = this.getEditorState();
    if (!state) return false;
    const cursorPos = state.selection.main.head;
    const line = state.doc.lineAt(cursorPos);
    return cursorPos === line.to && line.number === state.doc.lines;
  }

  public focus(direction: 'up' | 'down') {
    if (!this.editorRef?.current?.view) {
      console.warn('CodeCellViewModel.focus: No editor view available');
      return;
    }

    const view = this.editorRef.current.view;
    const state = view.state;

    console.log('CodeCellViewModel.focus executing', { direction, docLength: state.doc.length });

    // Focus the editor
    view.focus();

    // Set cursor position
    if (direction === 'up') {
      // Focus at the end (coming from below)
      const length = state.doc.length;
      view.dispatch({
        selection: { anchor: length, head: length },
        scrollIntoView: true,
      });
    } else {
      // Focus at the start (coming from above)
      view.dispatch({
        selection: { anchor: 0, head: 0 },
        scrollIntoView: true,
      });
    }
  }
}
