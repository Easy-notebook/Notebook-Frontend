import { Node, mergeAttributes, RawCommands } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useRef, useState } from 'react';
import useStore from '@Store/notebookStore';
import { getCellById } from '@Store/models/cellIndex';
import { useEditorReadOnly } from '../EditorAccessContext';
import { isCompositionInput } from '../utils/compositionInput';
import { EXTERNAL_CELL_SYNC } from '../TipTap/model/documentSync';

export const RawCellView: React.FC<any> = ({
  node,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
}) => {
  const readOnly = useEditorReadOnly();
  const updateCell = useStore((state) => state.updateCell);
  const cellId = node.attrs.cellId;
  const storeCell = useStore((state) => getCellById(state.cells, cellId));
  const contentFromStore = storeCell?.content ?? node.attrs.content ?? '';
  const [draft, setDraft] = useState<{
    base: string;
    value: string;
    storeOwned: boolean;
    cellId: string | null | undefined;
    error: string | null;
  } | null>(null);
  const isEditing = draft !== null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  // keep node attr and local state in sync with store
  useEffect(() => {
    const next = contentFromStore;
    if (storeCell?.type === 'raw' && next !== node.attrs.content) {
      editor.commands.command(({ tr }: { tr: import('@tiptap/pm/state').Transaction }) => {
        const position = getPos();
        if (typeof position !== 'number') return false;
        const current = tr.doc.nodeAt(position);
        if (current?.type.name !== 'rawBlock' || current.attrs.cellId !== cellId) return false;
        tr.setNodeMarkup(position, undefined, { ...current.attrs, content: next })
          .setMeta('addToHistory', false)
          .setMeta(EXTERNAL_CELL_SYNC, true);
        return true;
      });
    }
  }, [contentFromStore, node.attrs.content, cellId, storeCell, editor, getPos]);

  const beginEdit = () => {
    if (readOnly) return;
    setDraft({
      base: contentFromStore,
      value: contentFromStore,
      storeOwned: !!storeCell,
      cellId,
      error: null,
    });
  };

  const save = () => {
    if (!draft) return;
    if (draft.cellId !== cellId) {
      setDraft({
        ...draft,
        error:
          'Cell identity changed. Your original draft is retained for copying; press Escape to discard it.',
      });
      return;
    }
    if (readOnly || editor?.isDestroyed || editor?.isEditable === false) {
      setDraft({
        ...draft,
        error:
          'Editor is not editable. Your draft is retained; copy it or retry when editing is available.',
      });
      return;
    }
    const latest = getCellById(useStore.getState().cells, cellId);
    if ((draft.storeOwned && !latest) || (latest && latest.type !== 'raw')) {
      setDraft({
        ...draft,
        error: 'Cell was removed or converted. Your draft is retained for copying.',
      });
      return;
    }
    const currentContent = latest?.content ?? contentFromStore;
    const value = draft.value;
    if (value === draft.base || value === currentContent) {
      setDraft(null);
      return;
    }
    if (currentContent !== draft.base) {
      setDraft({
        ...draft,
        error:
          'Content changed while editing. Copy your draft, then press Escape to load the latest content.',
      });
      return;
    }
    if (cellId && updateCell) {
      updateCell(cellId, value);
    }
    updateAttributes({ content: value, cellId });
    setDraft(null);
  };

  return (
    <NodeViewWrapper className="raw-cell-wrapper my-3" data-cell-id={cellId}>
      {draft ? (
        <>
          <textarea
            ref={textareaRef}
            className="w-full min-h-[80px] p-2 font-mono text-sm border rounded bg-white text-black"
            value={draft.value}
            readOnly={readOnly}
            onChange={(e) => {
              if (!readOnly) setDraft({ ...draft, value: e.target.value, error: null });
            }}
            onBlur={save}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (isCompositionInput(e.nativeEvent)) return;
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(null);
              }
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            placeholder="Raw cell content (not interpreted as Markdown)"
          />
          {draft.error && (
            <p role="alert" className="text-sm text-red-600">
              {draft.error}
            </p>
          )}
        </>
      ) : (
        <div className="raw-cell-display group relative">
          <pre
            className="whitespace-pre-wrap font-mono text-sm bg-gray-50 border rounded p-3 text-gray-900"
            onDoubleClick={beginEdit}
            title="Double-click to edit raw content"
          >
            {node.attrs.content || ''}
          </pre>
          {!readOnly && (
            <button
              className="absolute -top-2 right-0 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-black bg-opacity-60 text-white rounded"
              onClick={() => beginEdit()}
              title="Edit"
            >
              Edit
            </button>
          )}
          {!readOnly && (
            <button
              className="absolute -top-2 right-14 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 bg-red-600 text-white rounded"
              onClick={() => deleteNode()}
              title="Delete"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const RawCellExtension = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      cellId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-cell-id'),
        renderHTML: (attrs: any) => ({ 'data-cell-id': attrs.cellId }),
      },
      content: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute('data-content') || '';
          try {
            return decodeURIComponent(v);
          } catch {
            return v;
          }
        },
        renderHTML: (attrs: any) => ({ 'data-content': encodeURIComponent(attrs.content || '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="raw-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'raw-block',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawCellView);
  },

  addCommands() {
    return {
      insertRawBlock:
        (options: { cellId?: string; content?: string } = {}) =>
        ({ commands }: { commands: RawCommands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { cellId: options.cellId || undefined, content: options.content || '' },
          });
        },
    } as Partial<RawCommands>;
  },
});
