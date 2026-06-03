/**
 * OOP read-side projection over the PM doc (Phase 1 scaffold).
 *
 * Immutable per state; the core recreates it on each change. It does NOT mirror
 * a side array — `cells` is derived live from the document, which is the single
 * source of truth. Intent builders (insertCell/removeCell/…) arrive in Phase 2.
 *
 * See docs/migration/00-architecture-and-core-api.md §5.2.
 * Framework-free: `prosemirror-model` / `prosemirror-state` only.
 */
import { EditorState } from 'prosemirror-state';
import { NotebookCell } from './NotebookCell';

export class NotebookDoc {
  private readonly state: EditorState;

  constructor(state: EditorState) {
    this.state = state;
  }

  /** Ordered projection of top-level cell nodes. */
  get cells(): NotebookCell[] {
    const cells: NotebookCell[] = [];
    this.state.doc.forEach((node, offset) => {
      cells.push(new NotebookCell(node, offset));
    });
    return cells;
  }

  get cellCount(): number {
    return this.state.doc.childCount;
  }

  cellById(id: string): NotebookCell | null {
    return this.cells.find((c) => c.id === id) ?? null;
  }

  cellAt(index: number): NotebookCell | null {
    const node = this.state.doc.maybeChild(index);
    if (!node) return null;
    // recompute offset for the requested index
    let offset = 0;
    for (let i = 0; i < index; i++) offset += this.state.doc.child(i).nodeSize;
    return new NotebookCell(node, offset);
  }

  toJSON(): unknown {
    return this.state.doc.toJSON();
  }
}
