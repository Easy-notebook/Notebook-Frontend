import type { CachedNotebook } from '../types';
/** One projection per saved document; views never mount editors or read storage. */
export function libraryPresentation(
  raw: unknown,
  kind?: 'document' | 'project' | 'chat'
): NonNullable<CachedNotebook['presentation']> {
  const doc = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cells = Array.isArray(doc.cells) ? doc.cells : [];
  const providers = new Set<'codex' | 'claude'>();
  const snippets: string[] = [];
  let code = false;
  for (const cell of cells) {
    if (!cell || typeof cell !== 'object') continue;
    const type = cell.type ?? cell.cell_type ?? cell.cellType;
    const agent = cell.metadata?.agent;
    if (type === 'agent' && ['codex', 'claude'].includes(agent?.provider)) {
      providers.add(agent.provider);
      const prompt = agent.turns?.find((turn: { prompt?: string }) => turn.prompt)?.prompt;
      if (prompt) snippets.unshift(prompt);
    }
    if (type === 'code') code = true;
    const source = cell.content ?? cell.source;
    const text = Array.isArray(source) ? source.join('') : source;
    if (typeof text === 'string' && type !== 'agent') snippets.push(text);
  }
  return {
    kind:
      kind ??
      (providers.size
        ? 'chat'
        : code || (Array.isArray(doc.tasks) && doc.tasks.length)
          ? 'project'
          : 'document'),
    providers: [...providers],
    preview: snippets
      .join('\n')
      .replace(/[#*`>]/g, '')
      .trim()
      .slice(0, 260),
  };
}
