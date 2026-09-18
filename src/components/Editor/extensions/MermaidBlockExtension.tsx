import { useId } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { MermaidPreview } from '../MermaidPreview';

function MermaidBlockView({ node, updateAttributes }: NodeViewProps) {
  const id = useId().replace(/:/g, '');
  const code = node.attrs.code as string;

  return (
    <NodeViewWrapper className="notebook-mermaid-block" data-type="mermaid-block">
      <label className="notebook-mermaid-label" htmlFor={`notebook-mermaid-source-${id}`}>
        Mermaid
      </label>
      <textarea
        id={`notebook-mermaid-source-${id}`}
        className="notebook-mermaid-source"
        value={code}
        onChange={(event) => updateAttributes({ code: event.target.value })}
        spellCheck={false}
        aria-label="Mermaid source"
      />
      <MermaidPreview source={code} />
    </NodeViewWrapper>
  );
}

/** Source text is the document value; SVG is a disposable derived preview. */
export const MermaidBlockExtension = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  defining: true,

  addAttributes() {
    return {
      code: {
        default: '',
        parseHTML: (element) => {
          const encoded = element.getAttribute('data-code') || '';
          try {
            return decodeURIComponent(encoded);
          } catch {
            return encoded;
          }
        },
        renderHTML: ({ code }) => ({ 'data-code': encodeURIComponent(code || '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mermaid-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-type': 'mermaid-block' }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlockView);
  },
});
