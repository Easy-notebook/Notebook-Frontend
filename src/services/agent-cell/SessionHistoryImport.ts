import type { Cell } from '@Store/models';
import { TranscriptBody } from '@Utils/importFile/claude/TranscriptBody';
export interface SessionHistory {
  info: {
    provider: 'codex' | 'claude';
    sessionId: string;
    title: string;
    cwd: string;
    updatedAt: number;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'tool' | 'system';
    text: string;
    raw?: unknown;
  }>;
}
/** Structured SDK messages bypass terminal-marker heuristics; Markdown uses the existing splitter. */
export function sessionHistoryCells(history: SessionHistory): Cell[] {
  let turn = 0;
  return history.messages.flatMap((message) => {
    if (message.role === 'user') turn++;
    const activity = message.role === 'tool' || message.role === 'system';
    const parts = activity
      ? [{ kind: 'status', content: message.text, language: undefined }]
      : new TranscriptBody().split(
          message.text.split('\n').map((text, number) => ({ text, number: number + 1 }))
        );
    return parts.map(
      (part, index): Cell => ({
        id: `session-${history.info.provider}-${history.info.sessionId}-${message.id}-${index}`,
        type: part.kind === 'code' ? 'code' : 'markdown',
        content:
          message.role === 'user' && index === 0 && part.kind === 'prose'
            ? `## ${part.content.replace(/^#{1,6}\s+/, '')}`
            : part.content,
        ...(part.kind === 'code' ? { language: part.language } : {}),
        outputs: [],
        phaseId: null,
        enableEdit: true,
        metadata: {
          importSource: `${history.info.provider}-session`,
          sourceSessionId: history.info.sessionId,
          sourceMessageId: message.id,
          transcriptFormat: 2,
          transcriptRole: message.role,
          transcriptKind: part.kind,
          turnIndex: turn,
          turnId: `session-turn-${turn}`,
          messageId: message.id,
          messageStart: index === 0,
          ...(message.raw ? { sourceRecord: message.raw } : {}),
        },
      })
    );
  });
}
