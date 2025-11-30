import { Cell as StoreCell } from '@Store/models';
import useStore from '@Store/notebookStore';
import editorLogger from '@Utils/logger/editor_logger';

export abstract class BaseCellViewModel {
  // State listeners
  protected listeners: Set<() => void> = new Set();

  // Properties
  public cell: StoreCell;

  constructor(cell: StoreCell) {
    this.cell = cell;
  }

  // Subscriptions
  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected notify() {
    this.listeners.forEach((l) => l());
  }

  // Common Getters
  get isEditing() {
    return useStore.getState().editingCellId === this.cell.id;
  }

  // Common Actions
  public updateProps(cell: StoreCell, ..._args: any[]) {
    if (this.cell !== cell) {
      this.cell = cell;
      this.notify();
    }
  }

  public toggleEditing = () => {
    const state = useStore.getState();
    if (!this.isEditing) {
      state.setEditingCellId(this.cell.id);
    } else {
      state.setEditingCellId(null);
    }
  };

  public deleteCell = () => {
    useStore.getState().deleteCell(this.cell.id);
  };

  public navigateToSibling(direction: 'up' | 'down') {
    const state = useStore.getState();
    // Use getCurrentViewCells if available (for detached view support), otherwise fallback to cells
    const navCells = state.getCurrentViewCells ? state.getCurrentViewCells() : state.cells;
    const currentIndex = navCells.findIndex((c) => c.id === this.cell.id);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    editorLogger.logNavigationAttempt(this.cell.id, this.cell.type, direction, {
      fromIndex: currentIndex,
      toIndex: newIndex,
      total: navCells.length,
    } as any);

    if (newIndex >= 0 && newIndex < navCells.length) {
      const targetCell = navCells[newIndex];
      editorLogger.logNavigationSuccess(
        this.cell.id,
        targetCell.id,
        this.cell.type,
        targetCell.type,
        direction
      );

      this.focusCell(targetCell, direction);
    } else {
      editorLogger.logNavigationBlocked(
        this.cell.id,
        this.cell.type,
        direction,
        'no_target_cell_available'
      );
    }
  }

  protected focusCell(targetCell: StoreCell, direction: 'up' | 'down') {
    const state = useStore.getState();

    if (targetCell.type === 'markdown') {
      state.setCurrentCell(targetCell.id);
      state.setEditingCellId(targetCell.id);
    } else {
      state.setEditingCellId(null);
      state.setCurrentCell(targetCell.id);

      if (targetCell.type === 'code') {
        // Dispatch event for CodeCell to handle cursor positioning
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('cell-navigation', {
              detail: { targetCellId: targetCell.id, direction },
            })
          );
        }, 0);

        // Attempt to focus the editor DOM element directly if possible
        setTimeout(() => {
          const codeElement = document.querySelector(
            `[data-cell-id="${targetCell.id}"] .cm-editor .cm-content`
          );
          if (codeElement) {
            (codeElement as HTMLElement).focus();
          }
        }, 150);
      }
    }
  }
}
