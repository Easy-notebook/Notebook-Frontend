import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { markdownCodeComponents } from '../../MarkdownCodePreview';
import { markdownRemarkPlugins } from '../../markdownPreviewPlugins';

/** Keep Markdown parsing intact; replace only complete Mermaid block previews. */
export const HybridMarkdown = memo(function HybridMarkdown({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={markdownRemarkPlugins} components={markdownCodeComponents}>
      {source}
    </ReactMarkdown>
  );
});
