import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from 'lexical';
import {
  $getTableColumnIndexFromTableCellNode,
  $isTableCellNode,
  $isTableNode,
} from '@lexical/table';
import { FrameTask } from './FrameTask';

/** Keep the table width stable while sharing space with the adjacent column. */
export function resizeColumnPair(widths: readonly number[], column: number, delta: number) {
  const neighbor = column + 1 < widths.length ? column + 1 : column - 1;
  if (neighbor < 0)
    return { column, width: Math.max(48, widths[column] + delta), neighbor, neighborWidth: 0 };
  const change = Math.max(48 - widths[column], Math.min(widths[neighbor] - 48, delta));
  return {
    column,
    width: widths[column] + change,
    neighbor,
    neighborWidth: widths[neighbor] - change,
  };
}

type Drag = {
  key: string;
  column: number;
  start: number;
  x: number;
  widths: number[];
  table: HTMLTableElement;
  group: Element;
  owned: boolean;
  cols: HTMLElement[];
  styles: string[];
};

/** idle → preview → commit/cancel. DOM preview is O(1); only release mutates the document. */
export class TableColumnResizeController {
  private drag: Drag | null = null;
  private hover: HTMLElement | null = null;
  private readonly preview = new FrameTask(() => this.paint());
  constructor(private readonly editor: LexicalEditor) {}
  private paint() {
    const drag = this.drag;
    if (!drag) return;
    const pair = resizeColumnPair(drag.widths, drag.column, drag.x - drag.start);
    drag.cols[pair.column].style.width = `${pair.width}px`;
    if (pair.neighbor >= 0) drag.cols[pair.neighbor].style.width = `${pair.neighborWidth}px`;
  }
  private move = (event: PointerEvent) => {
    if (this.drag) {
      this.drag.x = event.clientX;
      this.preview.schedule();
      return;
    }
    const cell = (event.target as Element)?.closest<HTMLElement>('td,th');
    if (this.hover && this.hover !== cell) this.hover.style.cursor = '';
    this.hover = cell ?? null;
    if (cell)
      cell.style.cursor =
        this.editor.isEditable() && Math.abs(cell.getBoundingClientRect().right - event.clientX) < 6
          ? 'col-resize'
          : '';
  };
  private clearHover = () => {
    if (this.hover) this.hover.style.cursor = '';
    this.hover = null;
  };
  private restore(drag: Drag) {
    if (drag.owned) drag.group.remove();
    else
      drag.cols.forEach((col, index) => {
        col.style.width = drag.styles[index];
      });
  }
  private finish = (event?: PointerEvent) => {
    const drag = this.drag;
    this.drag = null;
    this.preview.cancel();
    document.removeEventListener('pointermove', this.move);
    document.removeEventListener('pointerup', this.finish);
    document.removeEventListener('pointercancel', this.finish);
    if (!drag) return;
    this.restore(drag);
    if (
      !event ||
      event.type === 'pointercancel' ||
      !this.editor.isEditable() ||
      !drag.table.isConnected
    )
      return;
    const pair = resizeColumnPair(drag.widths, drag.column, event.clientX - drag.start);
    if (pair.width === drag.widths[drag.column]) return;
    const widths = [...drag.widths];
    widths[pair.column] = pair.width;
    if (pair.neighbor >= 0) widths[pair.neighbor] = pair.neighborWidth;
    this.editor.update(
      () => {
        const table = $getNodeByKey(drag.key);
        if ($isTableNode(table)) table.setColWidths(widths);
      },
      { tag: HISTORY_PUSH_TAG }
    );
  };
  private down = (event: PointerEvent) => {
    if (!this.editor.isEditable() || event.button !== 0) return;
    const cell = (event.target as Element)?.closest<HTMLTableCellElement>('td,th');
    const table = cell?.closest('table');
    if (!cell || !table || Math.abs(cell.getBoundingClientRect().right - event.clientX) >= 6)
      return;
    const identity = this.editor.read(() => {
      const node = $getNearestNodeFromDOMNode(cell);
      if (!$isTableCellNode(node)) return null;
      const parent = node.getParent()?.getParent();
      return $isTableNode(parent)
        ? { key: parent.getKey(), column: $getTableColumnIndexFromTableCellNode(node) }
        : null;
    });
    if (!identity) return;
    this.finish();
    // One measurement pass at gesture start, independent of the number of rows.
    const widths = Array.from(table.rows[0].cells).flatMap((item) =>
      Array(item.colSpan).fill(item.getBoundingClientRect().width / item.colSpan)
    ) as number[];
    if (!widths[identity.column]) return;
    let group = table.querySelector('colgroup');
    const owned = !group;
    if (!group) {
      group = document.createElement('colgroup');
      table.prepend(group);
    }
    if (owned) widths.forEach(() => group!.append(document.createElement('col')));
    const cols = Array.from(group.children) as HTMLElement[];
    if (cols.length !== widths.length) {
      if (owned) group.remove();
      return;
    }
    const styles = cols.map((col) => col.style.width);
    cols.forEach((col, index) => {
      col.style.width = `${widths[index]}px`;
    });
    this.drag = {
      ...identity,
      start: event.clientX,
      x: event.clientX,
      widths,
      table,
      group,
      owned,
      cols,
      styles,
    };
    document.addEventListener('pointermove', this.move);
    document.addEventListener('pointerup', this.finish);
    document.addEventListener('pointercancel', this.finish);
    event.preventDefault();
    event.stopPropagation();
  };
  attach() {
    const detach = this.editor.registerRootListener((root, previous) => {
      this.finish();
      this.clearHover();
      previous?.removeEventListener('pointerleave', this.clearHover);
      previous?.removeEventListener('pointerdown', this.down);
      previous?.removeEventListener('pointermove', this.move);
      root?.addEventListener('pointerleave', this.clearHover);
      root?.addEventListener('pointerdown', this.down);
      root?.addEventListener('pointermove', this.move);
    });
    const editable = this.editor.registerEditableListener((value) => {
      if (!value) this.finish();
    });
    return () => {
      detach();
      editable();
      this.finish();
      this.clearHover();
    };
  }
}
