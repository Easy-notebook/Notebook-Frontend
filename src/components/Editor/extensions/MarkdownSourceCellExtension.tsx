import { useEffect, useRef } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { previewMarkdownSource } from '../TipTap/model/sourceCellTransitions';
import { isCompositionInput } from '../utils/compositionInput';

export function MarkdownSourceCellView({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let mounted = true;
    // NodeViews mount during dispatch; focus the nested input after ProseMirror
    // finishes restoring its own DOM selection, before the next input event.
    queueMicrotask(() => {
      if (
        mounted &&
        !editor.isDestroyed &&
        editor.state.selection.from === getPos() &&
        editor.view.hasFocus()
      ) {
        input.current?.focus();
        input.current?.setSelectionRange(node.attrs.caret, node.attrs.caret);
      }
    });
    return () => {
      mounted = false;
    };
  }, [editor, getPos, node.attrs.caret]);
  const preview = () => {
    const pos = getPos();
    if (typeof pos !== 'number' || !editor.isEditable) return;
    previewMarkdownSource(editor, pos);
  };
  return (
    <NodeViewWrapper className="notebook-source-cell" data-cell-id={node.attrs.cellId}>
      <div contentEditable={false} className="notebook-mermaid-toolbar">
        <span>Markdown source</span>
        <button type="button" onClick={preview} disabled={!editor.isEditable}>
          Preview
        </button>
      </div>
      <textarea
        ref={input}
        aria-label="Markdown cell source"
        className="notebook-mermaid-source"
        value={node.attrs.source}
        readOnly={!editor.isEditable}
        spellCheck={false}
        onChange={(event) => {
          if (editor.isEditable) updateAttributes({ source: event.target.value });
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (!editor.isEditable || isCompositionInput(event.nativeEvent)) return;
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            event.preventDefault();
            if (event.shiftKey) editor.commands.redo();
            else editor.commands.undo();
          }
        }}
      />
    </NodeViewWrapper>
  );
}

/** Literal source is persisted, never interpreted while a fence is being repaired. */
export const MarkdownSourceCellExtension = Node.create({
  name: 'markdownSourceCell',
  group: 'block',
  atom: true,
  defining: true,
  addAttributes() {
    return {
      caret: { default: 0, rendered: false },
      cellId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-id'),
        renderHTML: (attrs) => ({ 'data-cell-id': attrs.cellId }),
      },
      source: {
        default: '',
        parseHTML: (element) => decodeURIComponent(element.getAttribute('data-source') || ''),
        renderHTML: (attrs) => ({ 'data-source': encodeURIComponent(attrs.source) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="markdown-source-cell"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-type': 'markdown-source-cell' }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MarkdownSourceCellView);
  },
});
