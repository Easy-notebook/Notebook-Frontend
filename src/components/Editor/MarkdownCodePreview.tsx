import type { Components } from 'react-markdown';
import { MermaidPreview } from './MermaidPreview';

/** Paired with remarkCompleteMermaid; stable types preserve diagram lifecycles. */
export const markdownCodeComponents: Components = {
  pre: function MarkdownCodePreview({ node, children, ...props }) {
    const code = node?.children[0];
    const source = code?.type === 'element' ? code.properties.dataMermaidSource : undefined;
    return typeof source === 'string'
      ? <MermaidPreview source={source} />
      : <pre {...props}>{children}</pre>;
  },
};

/** Preserve prose soft line breaks in layout, without rewriting Markdown source. */
export const markdownSoftLineComponents: Components = {
  p: function MarkdownParagraph({ node: _node, children, ...props }) {
    return <p {...props} style={{ ...props.style, whiteSpace: 'pre-line' }}>{children}</p>;
  },
};
