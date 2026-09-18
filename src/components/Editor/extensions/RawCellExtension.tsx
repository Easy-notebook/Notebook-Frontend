import { Node, mergeAttributes, RawCommands } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useRef, useState } from 'react';
import useStore from '@Store/notebookStore';
import { getCellById } from '@Store/models/cellIndex';
import { useEditorReadOnly } from '../EditorAccessContext';
import { isCompositionInput } from '../utils/compositionInput';

export const RawCellView: React.FC<any> = ({ node, updateAttributes, deleteNode }) => {
  const readOnly = useEditorReadOnly();
  const updateCell = useStore((state) => state.updateCell);
  const cellId = node.attrs.cellId;
  const storeCell = useStore((state) => getCellById(state.cells, cellId));
  const contentFromStore = storeCell?.content ?? node.attrs.content ?? '';
  const [isEditing, setIsEditing] = useState(false);
  const [temp, setTemp] = useState<string>(contentFromStore);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // keep node attr and local state in sync with store
  useEffect(() => {
    const next = contentFromStore;
    if (storeCell && next !== node.attrs.content) {
      updateAttributes({ content: next, cellId });
    }
    if (!isEditing) setTemp(next);
  }, [contentFromStore, node.attrs.content, cellId, isEditing, storeCell, updateAttributes]);

  const beginEdit = () => {
    if (readOnly) return;
    setIsEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const save = () => {
    if (readOnly) {
      setIsEditing(false);
      return;
    }
    const value = temp ?? '';
    if (cellId && updateCell) {
      updateCell(cellId, value);
    }
    updateAttributes({ content: value, cellId });
    setIsEditing(false);
  };

  return (
    <NodeViewWrapper className="raw-cell-wrapper my-3" data-cell-id={cellId}>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="w-full min-h-[80px] p-2 font-mono text-sm border rounded bg-white text-black"
          value={temp}
          readOnly={readOnly}
          onChange={(e) => {
            if (!readOnly) setTemp(e.target.value);
          }}
          onBlur={save}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (isCompositionInput(e.nativeEvent)) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              setIsEditing(false);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Raw cell content (not interpreted as Markdown)"
        />
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
