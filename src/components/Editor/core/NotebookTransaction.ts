/**
 * Thin, framework-free wrapper over a ProseMirror `Transaction` carrying
 * notebook-level intent + meta. It is what `NotebookEditorCore.dispatch`
 * consumes and what intent builders (`NotebookDoc.insertCell`, …) return.
 *
 * See docs/migration/00-architecture-and-core-api.md §5.4.
 */
import { Transaction } from 'prosemirror-state';

/** Meta key marking a transaction as originating from an external `applyExternal`. */
export const EXTERNAL_META = 'notebook/fromExternal';
/** ProseMirror's built-in history opt-out key (outputs / streamed writes). */
export const NO_HISTORY_META = 'addToHistory';

export type ChangeKind = 'structural' | 'content' | 'selection' | 'meta';

export class NotebookTransaction {
  readonly tr: Transaction;

  constructor(tr: Transaction) {
    this.tr = tr;
  }

  setMeta(key: string, value: unknown): this {
    this.tr.setMeta(key, value);
    return this;
  }

  /** Mark as external-origin so consumers (the adapter) skip it — echo guard. */
  markExternal(): this {
    this.tr.setMeta(EXTERNAL_META, true);
    return this;
  }

  /** Keep out of undo history + minimise disturbance — for outputs / streaming. */
  silent(): this {
    this.tr.setMeta(NO_HISTORY_META, false);
    return this;
  }

  get isExternal(): boolean {
    return this.tr.getMeta(EXTERNAL_META) === true;
  }

  /**
   * Coarse classification available from the transaction alone. The precise
   * structural-vs-content distinction (which needs the prior doc) is computed
   * by the core's dispatch interceptor; this is the fallback.
   */
  get changeKind(): ChangeKind {
    if (this.tr.docChanged) return 'content';
    if (this.tr.selectionSet) return 'selection';
    return 'meta';
  }
}
