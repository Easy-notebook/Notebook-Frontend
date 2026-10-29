import { RenderDiagnostics } from '../../../AgentVisuals/RenderDiagnostics';
import { memo, useDeferredValue, useMemo, useState, useId, createContext, useContext } from 'react';
import { ReadonlyMarkdown } from '../../ReadonlyMarkdown';
import { RotateCcw, FileText, X, ChevronRight } from 'lucide-react';
import type { AgentTurn } from '@Services/agent-cell/protocol';
import { answerSources, type AnswerSource } from './AnswerSources';
import './agent-answer.css';

interface CitationState {
  sources: AnswerSource[];
  hovered: string | null;
  selected: string | null;
  previewId: string;
  setHovered(id: string | null): void;
  setSelected(id: string | null): void;
}
const CitationContext = createContext<CitationState | null>(null);
// Stable component identity preserves focus and DOM anchors across hover and streamed tokens.
function Citation({ href, children }: { href?: string; children?: React.ReactNode }) {
  const state = useContext(CitationContext);
  const source = state?.sources.find((item) => item.href === href);
  if (!source || !state)
    return (
      <a
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  return (
    <button
      type="button"
      className="aa-citation"
      data-highlighted={state.hovered === source.id}
      aria-label={`来源：${source.title}`}
      aria-expanded={state.selected === source.id}
      aria-controls={state.previewId}
      onMouseEnter={() => state.setHovered(source.id)}
      onMouseLeave={() => state.setHovered(null)}
      onClick={() => state.setSelected(state.selected === source.id ? null : source.id)}
    >
      {source.name} {state.sources.indexOf(source) + 1}
    </button>
  );
}
const components = { a: Citation };
const AnswerMarkdown = memo(function AnswerMarkdown({ text }: { text: string }) {
  return <ReadonlyMarkdown source={text} components={components} />;
});

/** One renderer for chat, cell and detail; Markdown is deferred, controls remain urgent. */
export const AgentAnswer = memo(function AgentAnswer({
  text,
  turn,
  disabled = false,
  onRegenerate,
  onFollowUp,
}: {
  text: string;
  turn?: AgentTurn;
  disabled?: boolean;
  onRegenerate?(): void | Promise<void>;
  onFollowUp?(question: string): void | Promise<void>;
}) {
  const displayedText = useDeferredValue(text);
  const sources = useMemo(() => (turn ? answerSources(turn) : []), [turn?.actions]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const previewId = useId();
  const streaming = turn?.status === 'running' || turn?.status === 'cancelling';
  const related =
    turn?.followUps ?? sources.slice(0, 2).map((source) => `进一步解释「${source.title}」`);
  const preview = sources.find((source) => source.id === selected);
  const execute = async (action: () => void | Promise<void>) => {
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  const citationState = useMemo(
    () => ({ sources, hovered, selected, previewId, setHovered, setSelected }),
    [sources, hovered, selected, previewId]
  );
  const selectSource = (source: AnswerSource) =>
    setSelected(selected === source.id ? null : source.id);
  return (
    <section
      className="agent-answer"
      data-streaming={streaming}
      aria-label="AI 回答"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSelected(null);
      }}
    >
      {!!sources.length && (
        <div className="aa-sources" aria-label="来源">
          {sources.map((source, index) => (
            <button
              type="button"
              key={source.id}
              className="aa-source"
              data-highlighted={hovered === source.id || selected === source.id}
              onMouseEnter={() => setHovered(source.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => selectSource(source)}
              aria-expanded={selected === source.id}
              aria-controls={previewId}
            >
              <span className="aa-source-meta">
                <FileText size={15} />
                {source.name}
                <small>{index + 1}</small>
              </span>
              <span className="aa-source-title">{source.title}</span>
            </button>
          ))}
        </div>
      )}
      {preview && (
        <aside id={previewId} className="aa-source-preview" aria-label="来源预览">
          <div>
            <strong>{preview.title}</strong>
            <button type="button" aria-label="关闭来源预览" onClick={() => setSelected(null)}>
              <X size={14} />
            </button>
          </div>
          <pre>{preview.snippet}</pre>
        </aside>
      )}
      <div
        className="aa-body prose prose-sm max-w-none"
        aria-busy={streaming || displayedText !== text}
      >
        <RenderDiagnostics name="agent-answer-markdown">
          <CitationContext.Provider value={citationState}>
            <AnswerMarkdown text={displayedText} />
          </CitationContext.Provider>
        </RenderDiagnostics>
      </div>
      {!streaming && !!related.length && onFollowUp && (
        <div className="aa-related">
          <span>RELATED</span>
          {related.map((question) => (
            <button
              key={question}
              type="button"
              disabled={disabled}
              onClick={() => void execute(() => onFollowUp(question))}
            >
              {question}
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      )}
      {onRegenerate && (
        <footer className="aa-footer">
          <div className="aa-actions">
            {onRegenerate && (
              <button
                type="button"
                aria-label="重试"
                title="重试"
                disabled={disabled || streaming}
                onClick={() => void execute(onRegenerate)}
              >
                <RotateCcw size={15} />
              </button>
            )}
          </div>
        </footer>
      )}
      <span className="aa-notice" role="status">
        {notice}
      </span>
    </section>
  );
});
