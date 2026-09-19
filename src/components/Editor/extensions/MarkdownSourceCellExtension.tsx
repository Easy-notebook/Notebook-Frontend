import { useEffect, useRef } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { previewMarkdownSource } from '../TipTap/model/sourceCellTransitions';
import { handleSourceInputHistory } from '../utils/sourceInputHistory';
import { parseSourceCellType } from '../utils/sourceCellAttributes';
import { decodeTextAttribute } from '../utils/encodedText';

export function MarkdownSourceCellView({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const ownedPosition = () => {
    if (editor.isDestroyed || !editor.isEditable) return undefined;
    const pos = getPos();
    if (typeof pos !== 'number') return undefined;
    const current = editor.state.doc.nodeAt(pos);
    // A stable cell ID does not make a stale source buffer authoritative.
    return current === node ? pos : undefined;
  };
  const updateSource = (source: string) => {
    if (ownedPosition() !== undefined) updateAttributes({ source });
  };
  useEffect(() => {
    let mounted = true;
    // NodeViews mount during dispatch; focus the nested input after ProseMirror
    // finishes restoring its own DOM selection, before the next input event.
    queueMicrotask(() => {
      if (
        mounted &&
        !editor.isDestroyed &&
        editor.state.selection.from === ownedPosition() &&
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
    if (composing.current) return;
    const pos = ownedPosition();
    if (pos === undefined) return;
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
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onChange={(event) => {
          updateSource(event.target.value);
        }}
        onKeyDown={(event) =>
          ownedPosition() !== undefined && handleSourceInputHistory(event, editor, updateSource)
        }
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
      sourceCellType: {
        default: null,
        parseHTML: (element) => parseSourceCellType(element.getAttribute('data-source-cell-type')),
        renderHTML: (attrs) => {
          const type = parseSourceCellType(attrs.sourceCellType);
          return type ? { 'data-source-cell-type': type } : {};
        },
      },
      cellId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cell-id'),
        renderHTML: (attrs) => ({ 'data-cell-id': attrs.cellId }),
      },
      source: {
        default: '',
        parseHTML: (element) => decodeTextAttribute(element.getAttribute('data-source')),
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
