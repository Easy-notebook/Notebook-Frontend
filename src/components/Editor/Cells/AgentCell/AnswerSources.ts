import type { AgentTurn } from '@Services/agent-cell/protocol';
export interface AnswerSource {
  id: string;
  name: string;
  title: string;
  snippet: string;
  href: string;
}
/** Sources are successful reads from this turn, never links guessed from prose. */
export function answerSources(turn: AgentTurn): AnswerSource[] {
  const sources = new Map<string, AnswerSource>();
  for (const action of turn.actions) {
    if (action.name !== 'read_cell' || action.status !== 'completed') continue;
    const result = action.result as
      | { ok?: boolean; data?: { cellId?: unknown; content?: unknown } }
      | undefined;
    if (
      !result?.ok ||
      typeof result.data?.cellId !== 'string' ||
      typeof result.data.content !== 'string'
    )
      continue;
    const { cellId, content } = result.data;
    sources.set(cellId, {
      id: cellId,
      name: 'Notebook',
      title:
        content
          .split('\n')
          .find((line) => line.trim())
          ?.replace(/^#+\s*/, '')
          .slice(0, 120) || cellId,
      snippet: content.slice(0, 2400),
      href: `#cell-${encodeURIComponent(cellId)}`,
    });
  }
  return [...sources.values()];
}
