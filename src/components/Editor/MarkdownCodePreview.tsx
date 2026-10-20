import type { Components } from 'react-markdown';
import { MermaidPreview } from './MermaidPreview';
import { MathPreview } from './MathPreview';

/** Paired with remarkCompleteMermaid; stable types preserve diagram lifecycles. */
export const markdownCodeComponents: Components = {
  pre: function MarkdownCodePreview({ node, children, ...props }) {
    const code = node?.children[0];
    const source = code?.type === 'element' ? code.properties.dataMermaidSource : undefined;
    const classes = code?.type === 'element' ? code.properties.className : undefined;
    if (
      code?.type === 'element' &&
      Array.isArray(classes) &&
      (classes.includes('math-display') || classes.includes('language-math'))
    ) {
      const source = code.children
        .map((child) => (child.type === 'text' ? child.value : ''))
        .join('');
      return <MathPreview source={source.replace(/\n$/, '')} displayMode />;
    }
    return typeof source === 'string' ? (
      <MermaidPreview source={source} />
    ) : (
      <pre {...props}>{children}</pre>
    );
  },
  code: function MarkdownInlineMath({ node: _node, children, className, ...props }) {
    if (className?.split(/\s+/).includes('math-inline'))
      return <MathPreview source={String(children)} displayMode={false} />;
    return (
      <code {...props} className={className}>
        {children}
      </code>
    );
  },
};

/** Preserve prose soft line breaks in layout, without rewriting Markdown source. */
export const markdownSoftLineComponents: Components = {
  p: function MarkdownParagraph({ node: _node, children, ...props }) {
    return (
      <p {...props} style={{ ...props.style, whiteSpace: 'pre-line' }}>
        {children}
      </p>
    );
  },
};
