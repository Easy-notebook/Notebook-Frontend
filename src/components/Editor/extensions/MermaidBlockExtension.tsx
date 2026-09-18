import { useId, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { MermaidPreview } from '../MermaidPreview';

export function MermaidBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const id = useId().replace(/:/g, '');
  const code = node.attrs.code as string;
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [copyStatus, setCopyStatus] = useState('');

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('Source copied');
    } catch {
      setCopyStatus('Could not copy source');
    }
  };

  return (
    <NodeViewWrapper className="notebook-mermaid-block" data-type="mermaid-block">
      <div className="notebook-mermaid-toolbar">
        <span className="notebook-mermaid-label">Mermaid</span>
        <div className="notebook-mermaid-actions">
          <button
            type="button"
            aria-pressed={mode === 'preview'}
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
          <button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>
            Source
          </button>
          <button type="button" onClick={copySource} aria-label="Copy Mermaid source">
            Copy
          </button>
        </div>
      </div>
      {mode === 'source' ? (
        <textarea
          id={`notebook-mermaid-source-${id}`}
          className="notebook-mermaid-source"
          value={code}
          readOnly={!editor.isEditable}
          onChange={(event) => {
            if (editor.isEditable) updateAttributes({ code: event.target.value });
          }}
          onKeyDown={(event) => event.stopPropagation()}
          spellCheck={false}
          aria-label="Mermaid source"
        />
      ) : (
        <MermaidPreview source={code} />
      )}
      {copyStatus && (
        <span className="notebook-mermaid-copy-status" role="status">
          {copyStatus}
        </span>
      )}
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
      source: {
        default: '',
        parseHTML: (element) => decodeURIComponent(element.getAttribute('data-source') || ''),
        renderHTML: (attrs) => ({ 'data-source': encodeURIComponent(attrs.source) }),
      },
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
