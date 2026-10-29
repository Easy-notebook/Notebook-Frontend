import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from 'lexical';
import { ColumnsNode, ColumnNode } from './ColumnNodes';
import { resizeColumns } from './ColumnModel';

type ResizeState =
  | { phase: 'idle' }
  | {
      phase: 'resizing';
      key: string;
      element: HTMLElement;
      grid: HTMLElement;
      widths: readonly number[];
      preview: readonly number[];
      index: number;
      pointer: number;
      x: number;
      availableWidth: number;
    };
/** Preview stays in the view. Commit once on release; cancel never enters history. */
export function registerColumnResize(editor: LexicalEditor): () => void {
  let state: ResizeState = { phase: 'idle' };
  const project = (grid: HTMLElement, widths: readonly number[]) => {
    grid.style.gridTemplateColumns = widths.map((width) => width + 'fr').join(' ');
    Array.from(grid.children).forEach((column, index) =>
      column.lastElementChild?.setAttribute(
        'aria-valuenow',
        String(Math.round(widths[index] * 100))
      )
    );
  };
  const cancel = () => {
    if (state.phase === 'resizing') {
      const cancelled = state;
      const widths = editor.read(() => {
        const node = $getNodeByKey(cancelled.key);
        return node instanceof ColumnsNode ? node.widths() : cancelled.widths;
      });
      project(cancelled.grid, widths);
      cancelled.element.removeAttribute('data-resizing');
    }
    state = { phase: 'idle' };
  };
  const resolve = (target: EventTarget | null) => {
    if (
      !editor.isEditable() ||
      !(target instanceof Element) ||
      !target.matches('.document-column-divider') ||
      !editor.getRootElement()?.contains(target)
    )
      return null;
    return editor.read(() => {
      const column = $getNearestNodeFromDOMNode(target);
      const layout = column?.getParent();
      if (!(column instanceof ColumnNode) || !(layout instanceof ColumnsNode)) return null;
      const index = column.getIndexWithinParent();
      if (index >= layout.widths().length - 1) return null;
      const element = editor.getElementByKey(layout.getKey());
      if (!element) return null;
      return {
        key: layout.getKey(),
        widths: layout.widths(),
        index,
        element,
        grid: element.lastElementChild as HTMLElement,
      };
    });
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = resolve(event.target);
    if (!target) return;
    cancel();
    event.preventDefault();
    event.stopPropagation();
    const gap = parseFloat(getComputedStyle(target.grid).columnGap) || 0;
    const availableWidth =
      target.grid.getBoundingClientRect().width - gap * (target.widths.length - 1);
    if (availableWidth <= 0) return;
    state = {
      phase: 'resizing',
      ...target,
      preview: target.widths,
      pointer: event.pointerId,
      x: event.clientX,
      availableWidth,
    };
    target.element.dataset.resizing = 'true';
    (event.target as HTMLElement).focus({ preventScroll: true });
  };
  const move = (event: PointerEvent) => {
    if (state.phase !== 'resizing' || state.pointer !== event.pointerId) return;
    if (!state.element.isConnected) {
      cancel();
      return;
    }
    event.preventDefault();
    state.preview = resizeColumns(
      state.widths,
      state.index,
      (event.clientX - state.x) / state.availableWidth
    );
    project(state.grid, state.preview);
  };
  const up = (event: PointerEvent) => {
    if (state.phase !== 'resizing' || state.pointer !== event.pointerId) return;
    const finished = state;
    cancel();
    if (event.type !== 'pointerup') return;
    editor.update(
      () => {
        const node = $getNodeByKey(finished.key);
        if (
          node instanceof ColumnsNode &&
          node.widths().every((width, index) => width === finished.widths[index])
        )
          node.setWidths(finished.preview);
      },
      { tag: HISTORY_PUSH_TAG }
    );
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && state.phase === 'resizing') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const target = resolve(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    editor.update(
      () => {
        const node = $getNodeByKey(target.key);
        if (node instanceof ColumnsNode)
          node.setWidths(
            resizeColumns(
              node.widths(),
              target.index,
              (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 0.1 : 0.025)
            )
          );
      },
      { tag: HISTORY_PUSH_TAG }
    );
  };
  const unregister = editor.registerRootListener((root, previous) => {
    previous?.removeEventListener('pointerdown', down, true);
    root?.addEventListener('pointerdown', down, true);
  });
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', cancel);
  return () => {
    cancel();
    unregister();
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('blur', cancel);
  };
}
