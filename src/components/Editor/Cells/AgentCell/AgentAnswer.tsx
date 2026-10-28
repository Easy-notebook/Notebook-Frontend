import { RenderDiagnostics } from '../../../AgentVisuals/RenderDiagnostics';
import { memo, useDeferredValue } from 'react';
import ReactMarkdown from 'react-markdown';
import { markdownCodeComponents } from '../../MarkdownCodePreview';

const MarkdownAnswer = memo(function MarkdownAnswer({ text }: { text: string }) {
  return <ReactMarkdown components={markdownCodeComponents}>{text}</ReactMarkdown>;
});

/** Schedule Markdown rendering separately from urgent tool state; retain every answer update. */
export const AgentAnswer = memo(function AgentAnswer({ text }: { text: string }) {
  const displayedText = useDeferredValue(text);
  return (
    <div className="prose prose-sm max-w-none" aria-busy={displayedText !== text}>
      <RenderDiagnostics name="agent-answer-markdown">
        <MarkdownAnswer text={displayedText} />
      </RenderDiagnostics>
    </div>
  );
});
