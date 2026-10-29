import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { markdownRemarkPlugins } from './markdownPreviewPlugins';
import { markdownCodeComponents, markdownSoftLineComponents } from './MarkdownCodePreview';
import {
  MarkdownImage,
  MarkdownTable,
  MarkdownTableRow,
  MarkdownTableCell,
  MarkdownTableHead,
} from './Cells/MarkdownCell/components/MarkdownElements';

const elements: Components = {
  ...markdownCodeComponents,
  ...markdownSoftLineComponents,
  img: MarkdownImage,
  table: MarkdownTable,
  tr: MarkdownTableRow,
  td: MarkdownTableCell,
  th: MarkdownTableHead,
};

/** Notebook Markdown dialect and previews, without editor state or execution controls. */
export const ReadonlyMarkdown = memo(function ReadonlyMarkdown({
  source,
  components,
}: {
  source: string;
  components?: Components;
}) {
  const renderers = useMemo(
    () => (components ? { ...elements, ...components } : elements),
    [components]
  );
  return (
    <ReactMarkdown remarkPlugins={markdownRemarkPlugins} components={renderers}>
      {source}
    </ReactMarkdown>
  );
});
