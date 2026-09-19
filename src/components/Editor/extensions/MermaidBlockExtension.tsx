import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { MermaidPreview } from '../MermaidPreview';
import { handleSourceInputHistory } from '../utils/sourceInputHistory';
import { decodeTextAttribute } from '../utils/encodedText';

export function MermaidBlockView({
  node,
  updateAttributes,
  editor,
  selected,
  getPos,
}: NodeViewProps) {
  const id = useId().replace(/:/g, '');
  const code = node.attrs.code as string;
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [copyStatus, setCopyStatus] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const canEditSource = () => {
    if (editor.isDestroyed || !editor.isEditable) return false;
    const pos = getPos();
    // Nested diagrams have no cell ID. The rendered immutable node is the
    // revision this input was based on; do not overwrite a replacement revision.
    return typeof pos === 'number' && editor.state.doc.nodeAt(pos) === node;
  };
  const updateSource = (code: string) => {
    if (canEditSource()) updateAttributes({ code });
  };
  useEffect(() => {
    // A newly confirmed empty diagram is selected by the insertion transaction.
    // Wait until after that transaction so ProseMirror cannot steal input focus.
    // Unselected/imported diagrams must not grab focus while loading the notebook.
    if (selected && code === '' && editor.isEditable) setMode('source');
  }, [selected, code, editor.isEditable]);
  const sourceView = useRef({
    start: 0,
    end: 0,
    direction: 'none' as 'none' | 'forward' | 'backward',
    top: 0,
    left: 0,
  });
  useLayoutEffect(() => {
    const element = input.current;
    if (mode !== 'source' || !element) return;
    const saved = sourceView.current;
    element.focus({ preventScroll: true });
    element.setSelectionRange(saved.start, saved.end, saved.direction);
    element.scrollTop = saved.top;
    element.scrollLeft = saved.left;
  }, [mode]);

  const showPreview = () => {
    // The textarea, not ProseMirror, owns this composition session.
    if (composing.current || editor.isDestroyed) return;
    const element = input.current;
    if (element) {
      sourceView.current = {
        start: element.selectionStart,
        end: element.selectionEnd,
        direction: element.selectionDirection,
        top: element.scrollTop,
        left: element.scrollLeft,
      };
    }
    setMode('preview');
  };

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
          <button type="button" aria-pressed={mode === 'preview'} onClick={showPreview}>
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
          ref={input}
          id={`notebook-mermaid-source-${id}`}
          className="notebook-mermaid-source"
          value={code}
          readOnly={!editor.isEditable}
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
            canEditSource() && handleSourceInputHistory(event, editor, updateSource)
          }
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
        parseHTML: (element) => decodeTextAttribute(element.getAttribute('data-source')),
        renderHTML: (attrs) => ({ 'data-source': encodeURIComponent(attrs.source) }),
      },
      code: {
        default: '',
        parseHTML: (element) => decodeTextAttribute(element.getAttribute('data-code')),
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
