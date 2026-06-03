/**
 * NotebookEditorCore — the framework-free facade (Phase 1 scaffold).
 *
 * Owns the PM `EditorState` (+ optional `EditorView`), the single dispatch
 * interceptor that (a) classifies every change and (b) flags external-origin
 * transactions for echo-loop prevention, and the command registry. The shell
 * (React) calls `mount(dom)`; the core never imports React.
 *
 * GUARANTEE (enforced by core.import-restrictions.test.ts): this module and its
 * siblings import `prosemirror-*` only — no React, no Zustand, no `window`,
 * no `fetch`. All external reads/writes go through `applyExternal` + `on('change')`.
 *
 * See docs/migration/00-architecture-and-core-api.md §5.1.
 */
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode, Schema } from 'prosemirror-model';
import { minimalSchema } from './schema.minimal';
import { NotebookTransaction, ChangeKind, EXTERNAL_META } from './NotebookTransaction';
import { NotebookDoc } from './NotebookDoc';
import { CommandRegistry, CommandContext } from './NotebookCommand';
import { NotebookServices } from './ports';

export interface CoreOptions {
  schema?: Schema;
  commands?: CommandRegistry;
  services?: Partial<NotebookServices>;
  plugins?: Plugin[];
  initialDoc?: PMNode | unknown; // PMNode or PM JSON
}

export interface ChangeEvent {
  kind: ChangeKind;
  doc: NotebookDoc;
  transaction: NotebookTransaction;
  /** true if the originating transaction was marked external (applyExternal). */
  fromExternal: boolean;
}

export type Disposer = () => void;
type ChangeListener = (e: ChangeEvent) => void;

export class NotebookEditorCore {
  readonly schema: Schema;
  readonly commands: CommandRegistry;

  private editorState: EditorState;
  private editorView: EditorView | null = null;
  private services: NotebookServices;
  private readonly listeners = new Set<ChangeListener>();

  constructor(options: CoreOptions = {}) {
    this.schema = options.schema ?? minimalSchema;
    this.commands = options.commands ?? new CommandRegistry();
    this.services = { ...(options.services ?? {}) };

    const doc = this.resolveDoc(options.initialDoc);
    this.editorState = EditorState.create({
      schema: this.schema,
      doc,
      plugins: options.plugins ?? [],
    });
  }

  // --- state access ------------------------------------------------------
  get state(): EditorState {
    return this.editorState;
  }

  get view(): EditorView | null {
    return this.editorView;
  }

  get doc(): NotebookDoc {
    return new NotebookDoc(this.editorState);
  }

  // --- view lifecycle (shell-only; core never imports React) -------------
  mount(dom: HTMLElement): void {
    if (this.editorView) this.unmount();
    this.editorView = new EditorView(dom, {
      state: this.editorState,
      dispatchTransaction: (tr) => this.dispatch(new NotebookTransaction(tr)),
    });
  }

  unmount(): void {
    this.editorView?.destroy();
    this.editorView = null;
  }

  focus(): void {
    this.editorView?.focus();
  }

  destroy(): void {
    this.unmount();
    this.listeners.clear();
  }

  // --- transactions / commands -------------------------------------------
  /**
   * THE single interceptor. Applies the transaction, classifies the change,
   * keeps any mounted view in sync, and emits one `change` event carrying the
   * `fromExternal` flag. No timers, no `isInternalUpdate` window.
   */
  dispatch(tx: NotebookTransaction): void {
    const prev = this.editorState;
    const next = prev.apply(tx.tr);
    this.editorState = next;

    // Keep a mounted view consistent without re-entering our dispatch path.
    if (this.editorView && this.editorView.state !== next) {
      this.editorView.updateState(next);
    }

    const event: ChangeEvent = {
      kind: classifyChange(prev, next, tx),
      doc: new NotebookDoc(next),
      transaction: tx,
      fromExternal: tx.tr.getMeta(EXTERNAL_META) === true,
    };
    this.emit(event);
  }

  runCommand(id: string, args?: unknown): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    const ctx = this.commandContext();
    if (command.isAvailable && !command.isAvailable(ctx)) return false;
    return command.run(ctx, args);
  }

  can(id: string): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    return command.isAvailable ? command.isAvailable(this.commandContext()) : true;
  }

  // --- external sync seam (used by NotebookAdapter, Phase 4) -------------
  /**
   * Replace the document from an external source (store / OOP model). The
   * resulting transaction is marked external so `change` listeners that mirror
   * back to the store can skip it — preventing the echo loop WITHOUT timers.
   */
  applyExternal(doc: PMNode | unknown, opts: { addToHistory?: boolean } = {}): void {
    const node = this.resolveDoc(doc);
    if (!node) return;
    const tr = this.editorState.tr.replaceWith(0, this.editorState.doc.content.size, node.content);
    tr.setMeta(EXTERNAL_META, true);
    if (opts.addToHistory === false) tr.setMeta('addToHistory', false);
    this.dispatch(new NotebookTransaction(tr));
  }

  on(event: 'change', cb: ChangeListener): Disposer {
    if (event !== 'change') throw new Error(`Unknown event: ${event}`);
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setServices(services: Partial<NotebookServices>): void {
    this.services = { ...this.services, ...services };
  }

  // --- internals ----------------------------------------------------------
  private emit(event: ChangeEvent): void {
    this.listeners.forEach((cb) => cb(event));
  }

  private commandContext(): CommandContext {
    return {
      state: this.editorState,
      dispatch: (tx) => this.dispatch(tx),
      view: this.editorView,
      schema: this.schema,
      services: this.services,
      doc: this.doc,
    };
  }

  private resolveDoc(doc: PMNode | unknown): PMNode | undefined {
    if (doc == null) return undefined;
    if (doc instanceof PMNode) return doc;
    try {
      return this.schema.nodeFromJSON(doc);
    } catch {
      return undefined;
    }
  }
}

/**
 * Classify a change as structural (cell add/remove/reorder/type-change),
 * content (text edit within unchanged structure), selection, or meta.
 * Structural detection compares the top-level child signature.
 */
function classifyChange(prev: EditorState, next: EditorState, tx: NotebookTransaction): ChangeKind {
  if (!tx.tr.docChanged) {
    return tx.tr.selectionSet ? 'selection' : 'meta';
  }
  return sameStructure(prev.doc, next.doc) ? 'content' : 'structural';
}

function sameStructure(a: PMNode, b: PMNode): boolean {
  if (a.childCount !== b.childCount) return false;
  for (let i = 0; i < a.childCount; i++) {
    const ca = a.child(i);
    const cb = b.child(i);
    if (ca.type.name !== cb.type.name) return false;
    if (ca.attrs.cellId !== cb.attrs.cellId) return false;
  }
  return true;
}
