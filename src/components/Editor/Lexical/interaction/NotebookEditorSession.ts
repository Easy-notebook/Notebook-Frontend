import { suspendExternalSelection } from './ExternalSelection';
import { agentFenceProvider, agentFenceCell } from '@/services/agent-cell/AgentFence';
import {
  $getRoot,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isNodeSelection,
  $createNodeSelection,
  $setSelection,
  HISTORIC_TAG,
  SKIP_DOM_SELECTION_TAG,
  CLEAR_HISTORY_COMMAND,
  type LexicalEditor,
  type ParagraphNode,
} from 'lexical';
import type { Cell } from '@Store/models';
import useStore from '@Store/notebookStore';
import {
  $createCellNode,
  $cellAncestor,
  $readCells,
  EXTERNAL_NOTEBOOK_SYNC,
} from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { EmbeddedCellNode } from '../model/EmbeddedCellNode';
import { cellsChanged, reconcileCells } from '../model/reconcileCells';
import { isNotebookTitleCell } from '../../utils/documentTitle';

type SessionPhase = 'creating' | 'ready' | 'publishing' | 'synchronizing' | 'disposed';
/** One session owns tree/store reconciliation and the cell snapshots needed by undo. */
export class NotebookEditorSession {
  phase: SessionPhase = 'creating';
  private snapshots = new Map<string, Cell>();
  private detach: (() => void)[] = [];
  constructor(
    readonly editor: LexicalEditor,
    readonly notebookId: string | null
  ) {
    useStore.getState().cells.forEach((cell) => this.snapshots.set(cell.id, cell));
  }
  cell(id: string) {
    return this.snapshots.get(id) ?? useStore.getState().cells.find((cell) => cell.id === id);
  }
  owns() {
    return this.phase !== 'disposed' && useStore.getState().notebookId === this.notebookId;
  }
  attach() {
    if (this.phase !== 'creating' && this.phase !== 'disposed')
      throw new Error('Notebook editor session already attached');
    useStore.getState().cells.forEach((cell) => this.snapshots.set(cell.id, cell));
    this.phase = 'ready';
    this.detach.push(
      this.editor.registerUpdateListener(
        ({ editorState, prevEditorState, tags, dirtyElements, dirtyLeaves }) => {
          if (!this.owns() || this.phase !== 'ready' || tags.has(EXTERNAL_NOTEBOOK_SYNC)) return;
          const selectionCell = editorState.read(() => {
            const selection = $getSelection();
            return $isRangeSelection(selection)
              ? $cellAncestor(selection.anchor.getNode())?.getCellId()
              : $isNodeSelection(selection)
                ? $cellAncestor(selection.getNodes()[0] ?? null)?.getCellId()
                : undefined;
          });
          if (selectionCell && useStore.getState().currentCellId !== selectionCell)
            useStore.getState().setCurrentCell(selectionCell);
          if (!dirtyElements.size && !dirtyLeaves.size) return;
          this.phase = 'publishing';
          try {
            const state = useStore.getState();
            // Inspect both sides: moving a block dirties its old and new owning cells.
            // History restores a complete snapshot and deliberately serializes every cell.
            const changed = tags.has(HISTORIC_TAG) ? undefined : new Set<string>();
            if (changed) {
              const keys = new Set([...dirtyElements.keys(), ...dirtyLeaves]);
              for (const snapshot of [prevEditorState, editorState])
                snapshot.read(
                  () => {
                    for (const key of keys) {
                      const cell = $cellAncestor($getNodeByKey(key));
                      if (cell) changed.add(cell.getCellId());
                    }
                  },
                  { editor: this.editor }
                );
            }
            const projected = editorState.read(() => $readCells((id) => this.cell(id), changed), {
              editor: this.editor,
            });
            const next = reconcileCells(projected, state.cells);
            next.forEach((cell) => this.snapshots.set(cell.id, cell));
            if (cellsChanged(next, state.cells)) state.setCells(next);
          } finally {
            if (this.owns()) this.phase = 'ready';
          }
        }
      )
    );
    this.detach.push(
      useStore.subscribe((state, previous) => {
        if (!this.owns()) {
          this.dispose();
          return;
        }
        if (state.cells === previous.cells) return;
        state.cells.forEach((cell) => this.snapshots.set(cell.id, cell));
        if (this.phase !== 'ready') return;
        const authoredChange =
          state.cells.length !== previous.cells.length ||
          state.cells.some((cell, index) => {
            const before = previous.cells[index];
            return (
              !before ||
              cell.id !== before.id ||
              cell.type !== before.type ||
              cell.content !== before.content ||
              cell.language !== before.language ||
              cell.metadata?.sourceCellType !== before.metadata?.sourceCellType ||
              cell.metadata?.editorMode !== before.metadata?.editorMode
            );
          });
        // Metadata-only runtime events are rendered by subscribed embedded cells.
        if (!authoredChange) return;
        this.phase = 'synchronizing';
        try {
          this.editor.update(
            () => {
              const restoreSelection = authoredChange ? suspendExternalSelection() : undefined;
              const root = $getRoot();
              const current = new Map(
                root
                  .getChildren()
                  .flatMap((node) =>
                    node instanceof NotebookCellNode || node instanceof EmbeddedCellNode
                      ? [[node.getCellId(), node] as const]
                      : []
                  )
              );
              const old = new Map(previous.cells.map((cell) => [cell.id, cell]));
              const wanted = new Set(state.cells.map((cell) => cell.id));
              for (const [id, node] of current) if (!wanted.has(id)) node.remove();
              let predecessor: NotebookCellNode | EmbeddedCellNode | null = null;
              state.cells.forEach((cell, index) => {
                let node = current.get(cell.id);
                const before = old.get(cell.id);
                const title = index === 0 && isNotebookTitleCell(cell);
                const rich = cell.type === 'markdown' && cell.metadata?.editorMode !== 'source';
                const mustReplace =
                  !node ||
                  rich !== node instanceof NotebookCellNode ||
                  before?.type !== cell.type ||
                  (rich &&
                    (before?.content !== cell.content ||
                      (node instanceof NotebookCellNode && node.isTitle() !== title)));
                if (mustReplace) {
                  const replacement = $createCellNode(cell, title);
                  if (node) node.replace(replacement);
                  node = replacement;
                }
                if (!node) return;
                if (node instanceof EmbeddedCellNode && before !== cell) node.sync(cell);
                if (predecessor) {
                  if (predecessor.getNextSibling()?.getKey() !== node.getKey())
                    predecessor.insertAfter(node);
                } else if (root.getFirstChild()?.getKey() !== node.getKey()) {
                  const first = root.getFirstChild();
                  if (first) first.insertBefore(node);
                  else root.append(node);
                }
                predecessor = node;
              });
              restoreSelection?.();
            },
            { discrete: true, tag: [EXTERNAL_NOTEBOOK_SYNC, HISTORIC_TAG, SKIP_DOM_SELECTION_TAG] }
          );
          if (authoredChange) this.editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
        } finally {
          if (this.owns()) this.phase = 'ready';
        }
      })
    );
    return () => this.dispose();
  }
  createEmbedded(cell: Cell) {
    this.snapshots.set(cell.id, cell);
    return new EmbeddedCellNode(cell);
  }
  insert(cell: Cell) {
    if (!this.owns() || !this.editor.isEditable()) return;
    this.snapshots.set(cell.id, cell);
    this.editor.update(
      () => {
        const selection = $getSelection();
        const current = $isRangeSelection(selection)
          ? $cellAncestor(selection.anchor.getNode())
          : $isNodeSelection(selection)
            ? $cellAncestor(selection.getNodes()[0] ?? null)
            : null;
        const node = $createCellNode(cell);
        if (current) current.insertAfter(node);
        else $getRoot().append(node);
        if (node instanceof NotebookCellNode) node.selectEnd();
        else {
          const selected = $createNodeSelection();
          selected.add(node.getKey());
          $setSelection(selected);
        }
      },
      { discrete: true }
    );
  }
  /** Promote a top-level fence without discarding adjacent Markdown blocks. */
  promoteCodeFence(paragraph: ParagraphNode, language: string) {
    if (!this.owns() || !this.editor.isEditable()) return;
    const cell = paragraph.getParent();
    if (!(cell instanceof NotebookCellNode) || cell.isTitle()) return;
    const before = paragraph.getPreviousSiblings();
    const after = paragraph.getNextSiblings();
    const original = this.cell(cell.getCellId());
    const provider = agentFenceProvider(language);
    const code: Cell = provider
      ? agentFenceCell(
          before.length || after.length ? crypto.randomUUID() : cell.getCellId(),
          provider
        )
      : {
          id: before.length || after.length ? crypto.randomUUID() : cell.getCellId(),
          type: 'code',
          content: '',
          language,
          outputs: [],
          enableEdit: true,
        };
    this.snapshots.set(code.id, code);
    const embedded = new EmbeddedCellNode(code);
    if (before.length) {
      paragraph.remove();
      cell.insertAfter(embedded);
      if (after.length) embedded.insertAfter(new NotebookCellNode().append(...after));
    } else if (after.length) {
      paragraph.remove();
      cell.insertBefore(embedded);
    } else {
      if (original) this.snapshots.set(code.id, { ...original, ...code });
      cell.replace(embedded);
    }
    const selection = $createNodeSelection();
    selection.add(embedded.getKey());
    $setSelection(selection);
    this.focusEmbeddedCell(code.id);
  }
  focusEmbeddedCell(id: string, direction?: 'up' | 'down') {
    if (typeof requestAnimationFrame === 'undefined') return;
    requestAnimationFrame(() => {
      if (!this.owns() || !this.editor.isEditable()) return;
      if (direction)
        window.dispatchEvent(
          new CustomEvent('cell-navigation', { detail: { targetCellId: id, direction } })
        );
      this.editor
        .getRootElement()
        ?.querySelector<HTMLElement>(
          `[data-cell-id="${CSS.escape(id)}"] :is(.cm-content, textarea[aria-label="Agent prompt"])`
        )
        ?.focus();
    });
  }
  updateSource(id: string, base: string, content: string): boolean {
    if (!this.owns() || !this.editor.isEditable()) return false;
    const latest = useStore.getState().cells.find((cell) => cell.id === id);
    if (!latest || latest.content !== base) return false;
    let updated = false;
    this.editor.update(
      () => {
        for (const node of $getRoot().getChildren())
          if (
            (node instanceof EmbeddedCellNode || node instanceof NotebookCellNode) &&
            node.getCellId() === id
          ) {
            if (node instanceof EmbeddedCellNode) node.sync({ ...latest, content });
            else {
              const selection = $getSelection();
              const selected =
                $isRangeSelection(selection) &&
                ($cellAncestor(selection.anchor.getNode()) === node ||
                  $cellAncestor(selection.focus.getNode()) === node);
              const replacement = $createCellNode({ ...latest, content }, node.isTitle());
              node.replace(replacement);
              if (selected && replacement instanceof NotebookCellNode) replacement.selectEnd();
            }
            updated = true;
          }
      },
      { discrete: true, tag: SKIP_DOM_SELECTION_TAG }
    );
    return updated;
  }
  remove(id: string) {
    if (!this.owns() || !this.editor.isEditable()) return;
    this.editor.update(
      () => {
        for (const node of $getRoot().getChildren())
          if (
            (node instanceof NotebookCellNode || node instanceof EmbeddedCellNode) &&
            node.getCellId() === id
          )
            node.remove();
      },
      { discrete: true }
    );
  }
  replace(cell: Cell, expected?: Cell) {
    if (expected) {
      const latest = useStore.getState().cells.find((item) => item.id === expected.id);
      if (!latest || latest.type !== expected.type || latest.content !== expected.content) return;
    }
    if (!this.owns() || !this.editor.isEditable()) return;
    this.snapshots.set(cell.id, cell);
    this.editor.update(
      () => {
        for (const node of $getRoot().getChildren())
          if (
            (node instanceof NotebookCellNode || node instanceof EmbeddedCellNode) &&
            node.getCellId() === cell.id
          )
            node.replace($createCellNode(cell));
      },
      { discrete: true }
    );
  }
  dispose() {
    if (this.phase === 'disposed') return;
    this.phase = 'disposed';
    this.detach.splice(0).forEach((fn) => fn());
    this.snapshots.clear();
  }
}
