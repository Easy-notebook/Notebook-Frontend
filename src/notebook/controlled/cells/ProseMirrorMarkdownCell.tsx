import React, { useEffect, useRef } from 'react';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { Plugin } from 'prosemirror-state';
import 'prosemirror-view/style/prosemirror.css';
import {
  CommandRegistry,
  NotebookEditorCore,
  cellsToDoc,
  createBuiltinCommands,
  docToCells,
  notebookSchema,
} from '@/components/Editor/core';
import type { EasyNotebookCell, EasyNotebookCellComponentProps } from '../../headless';

/**
 * Markdown cell body backed by the framework-free ProseMirror kernel
 * (`NotebookEditorCore`). It replaces the legacy textarea + ReactMarkdown
 * body via the `components.cells.markdown` injection seam.
 *
 * Bridging contract:
 *  - cell.content (markdown string) -> PM doc via `cellsToDoc([cell])`
 *  - PM doc -> markdown string via `docToCells(doc)[markdownCell].content`
 *
 * Echo safety: external syncs go through `core.applyExternal`, which flags the
 * transaction so the `change` listener can skip mirroring it back (no timers).
 */

/** Serialize the single markdown cell out of the core's current document. */
const serializeContent = (core: NotebookEditorCore): string => {
  const cells = docToCells(core.state.doc);
  const markdownCell = cells.find((c) => c.type === 'markdown') ?? cells[0];
  return markdownCell?.content ?? '';
};

/** Build a one-element notebook doc holding just this markdown cell's content. */
const buildDoc = (cell: Pick<EasyNotebookCell, 'id' | 'content'>) =>
  cellsToDoc([{ id: cell.id, type: 'markdown', content: cell.content ?? '' }]);

export const ProseMirrorMarkdownCell: React.FC<EasyNotebookCellComponentProps> = ({
  cell,
  readOnly,
  actions,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<NotebookEditorCore | null>(null);
  // Last markdown we are aware of (from either side) so we can suppress
  // redundant external syncs and skip echoing our own edits back.
  const lastContentRef = useRef<string>(cell.content ?? '');
  // Keep mutable handles to the freshest cell id / readOnly / actions so the
  // single mount effect (which must NOT re-run per keystroke) sees current values.
  const cellIdRef = useRef(cell.id);
  const readOnlyRef = useRef(readOnly);
  const actionsRef = useRef(actions);

  cellIdRef.current = cell.id;
  readOnlyRef.current = readOnly || cell.enableEdit === false;
  actionsRef.current = actions;

  // Mount once per cell id. The editor instance owns its lifecycle; React only
  // drives mount/unmount and external sync.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const commands = new CommandRegistry();
    commands.registerAll(createBuiltinCommands());

    const editablePlugin = new Plugin({
      props: {
        editable: () => !readOnlyRef.current,
      },
    });

    const core = new NotebookEditorCore({
      schema: notebookSchema,
      commands,
      initialDoc: buildDoc({ id: cellIdRef.current, content: lastContentRef.current }),
      plugins: [
        history(),
        keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
        keymap(commands.toKeymap()),
        keymap(baseKeymap),
        editablePlugin,
      ],
    });
    coreRef.current = core;

    const dispose = core.on('change', (event) => {
      if (event.fromExternal) return;
      if (event.kind === 'selection' || event.kind === 'meta') return;
      const next = serializeContent(core);
      if (next === lastContentRef.current) return;
      lastContentRef.current = next;
      actionsRef.current.updateContent(cellIdRef.current, next);
    });

    core.mount(host);

    return () => {
      dispose();
      core.destroy();
      coreRef.current = null;
    };
    // Mount lifecycle is keyed by cell id; content/readOnly are handled by the
    // sync effects below to avoid tearing down PM state on every keystroke.
  }, [cell.id]);

  // External content sync (store -> editor). Only push in when the incoming
  // prop genuinely diverges from what the editor already holds, to avoid
  // clobbering the cursor on every render.
  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    const incoming = cell.content ?? '';
    if (incoming === lastContentRef.current) return;
    lastContentRef.current = incoming;
    core.applyExternal(buildDoc({ id: cell.id, content: incoming }), { addToHistory: false });
  }, [cell.id, cell.content]);

  // readOnly sync: re-evaluate the editable prop so PM re-renders contentEditable.
  useEffect(() => {
    const core = coreRef.current;
    if (!core?.view) return;
    core.view.updateState(core.state);
  }, [readOnly, cell.enableEdit]);

  return (
    <div
      ref={hostRef}
      className="easy-notebook-pm-markdown prose max-w-none rounded border border-border/70 bg-background p-3 dark:prose-invert"
      data-readonly={readOnly || cell.enableEdit === false ? 'true' : 'false'}
    />
  );
};

export default ProseMirrorMarkdownCell;
