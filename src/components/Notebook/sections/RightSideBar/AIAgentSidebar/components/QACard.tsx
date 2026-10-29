import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';
import { FactCapture } from '@Editor/NotebookContext/FactCapture';
import { ReadonlyMarkdown } from '@Editor/ReadonlyMarkdown';
import { AgentAnswer } from '@Editor/Cells/AgentCell/AgentAnswer';
import { AgentAvatar, AgentDialog } from '@/components/AgentVisuals/shared';
import { ActionPayload } from '@/components/AgentVisuals/AgentThinking';
import { ReadingViewport } from '@/components/AgentVisuals/ReadingViewport';
import useNotebookStore from '@Store/notebookStore';
import type { QAItem } from '@Store/models/agent';
import '@Editor/Cells/AgentCell/agent-cell.css';

interface QACardProps {
  qa: QAItem;
  index: number;
  totalCount: number;
}

/** Operation-stream records share the message presentation, not the Agent session lifecycle. */
function QACard({ qa }: QACardProps) {
  const { t } = useTranslation();
  const notebookId = useNotebookStore((state) => state.notebookId);
  const [details, setDetails] = useState(false);
  const user = qa.type === 'user';
  const name = qa.agentType || qa.agent || 'Assistant';
  const provider = /claude/i.test(name)
    ? 'claude'
    : /codex|openai/i.test(name)
      ? 'codex'
      : undefined;
  const content = qa.content || '';
  const source = {
    notebookId: notebookId || '',
    cellId: qa.cellId,
    conversationId: 'sidebar',
    messageId: qa.id,
    role: user ? ('user' as const) : ('assistant' as const),
  };
  const emptyStatus = qa.onProcess
    ? t('rightSideBar.thinking')
    : t(
        !qa.resolved && qa.thinkingStartAtMs !== undefined
          ? 'rightSideBar.responseInterrupted'
          : 'rightSideBar.noContent'
      );
  return (
    <section
      id={qa.id}
      className={
        user ? 'av-theme av-chat-message av-chat-user' : 'agent-cell agent-message-callout av-theme'
      }
      data-provider={provider}
    >
      <header className="agent-cell-toolbar flex items-center gap-2 px-3 py-2">
        {!user && (
          <AgentAvatar
            name={provider === 'claude' ? 'Claude Code' : provider === 'codex' ? 'Codex' : name}
          />
        )}
        <strong className="agent-message-author">{user ? 'You' : name}</strong>
        {!user && qa.onProcess && (
          <span role="status" className="agent-turn-description">
            {t('rightSideBar.thinking')}
          </span>
        )}
        {!user && (
          <button
            type="button"
            className="agent-toolbar-button ml-auto"
            aria-label="回答详情"
            title="详情与行动"
            onClick={() => setDetails(true)}
          >
            <CircleHelp size={15} />
          </button>
        )}
      </header>
      <div className="px-3 pb-2">
        <FactCapture source={source} disabled={!notebookId}>
          {content.trim() ? (
            user ? (
              <ReadonlyMarkdown source={content} />
            ) : (
              <AgentAnswer text={content} />
            )
          ) : (
            <p className="av-muted" role="status">
              {emptyStatus}
            </p>
          )}
        </FactCapture>
      </div>
      {details && (
        <AgentDialog title="回答详情" close={() => setDetails(false)} variant="details">
          <header className="agent-turn-heading">
            <AgentAvatar
              name={provider === 'claude' ? 'Claude Code' : provider === 'codex' ? 'Codex' : name}
            />
            <strong>{name}</strong>
            <span className="av-muted">{qa.timestamp}</span>
          </header>
          <ReadingViewport label="回答详情记录" className="av-detail-history">
            <AgentAnswer text={content} />
            {!!qa.toolCalls?.length && (
              <details className="agent-execution-trace">
                <summary>行动记录</summary>
                {qa.toolCalls.map((tool, index) => (
                  <section key={`${qa.id}-${index}`} className="py-2">
                    <strong>{tool.name || tool.type || 'Tool'}</strong>
                    <ActionPayload value={tool} />
                  </section>
                ))}
              </details>
            )}
            {!qa.resolved && !qa.onProcess && (
              <p className="av-muted">{t('rightSideBar.responseInterrupted')}</p>
            )}
          </ReadingViewport>
        </AgentDialog>
      )}
    </section>
  );
}
export default memo(QACard);
