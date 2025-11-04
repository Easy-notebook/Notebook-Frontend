import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect } from 'react';
import useStore from '../../../store/notebookStore';
import LinkCell from '../Cells/LinkCell';

export interface FileAttachmentAttributes {
  cellId: string | null;
  markdown: string; // e.g. [label](href)
}

export interface FileAttachmentOptions {}

const FileAttachmentView: React.FC<any> = ({ node, updateAttributes, deleteNode }) => {
  const { cells } = useStore();

  const matchedCell = React.useMemo(() => {
    const byId = cells.find(c => c.id === node?.attrs?.cellId);
    if (byId) return byId;
    const markdown = node?.attrs?.markdown || '';
    return cells.find(c => c.type === 'link' && (c.content || '') === markdown) || null;
  }, [cells, node?.attrs?.cellId, node?.attrs?.markdown]);

  const fallbackId = React.useMemo(() => node?.attrs?.cellId || `attach-${Math.random().toString(36).slice(2)}`,[node?.attrs?.cellId]);
  const cell = matchedCell || {
    id: fallbackId,
    type: 'link',
    content: node?.attrs?.markdown || '',
    outputs: [],
    enableEdit: false,
  } as any;

  // 仅当在 store 中找到匹配时，写回稳定的 cellId，避免覆盖其它 cell
  useEffect(() => {
    // 仅当存在匹配的 store cell 且与当前 attrs 不一致时才写回，避免撤销后覆盖历史值
    if (matchedCell) {
      const nextAttrs = {
        cellId: matchedCell.id,
        markdown: matchedCell.content || '',
      }
      const changed = (
        node?.attrs?.cellId !== nextAttrs.cellId ||
        node?.attrs?.markdown !== nextAttrs.markdown
      )
      if (changed) {
        updateAttributes(nextAttrs);
      }
    }
  }, [matchedCell?.id, matchedCell?.content, node?.attrs?.markdown, node?.attrs?.cellId]);

  return (
    <NodeViewWrapper>
      <LinkCell
        cell={cell as any}
        readOnly={!matchedCell}
        onDelete={() => deleteNode()}
        isInDetachedView={false}
      />
    </NodeViewWrapper>
  );
};

export const FileAttachmentExtension = Node.create<FileAttachmentOptions, FileAttachmentAttributes>({
  name: 'fileAttachment',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      cellId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-cell-id'),
        renderHTML: attrs => ({ 'data-cell-id': attrs.cellId }),
      },
      markdown: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-markdown') || '',
        renderHTML: attrs => ({ 'data-markdown': attrs.markdown || '' }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-attachment"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'file-attachment',
        'data-cell-id': node.attrs.cellId,
        'data-markdown': node.attrs.markdown || '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentView);
  },
});

