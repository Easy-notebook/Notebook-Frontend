import { createMarkdownParser, escapeHtml } from './inlineMarkdown';
import { scanFencedMarkdown, standaloneFence } from './fencedMarkdown';

type HeadingCounters = Map<string, Map<string, number>>;
interface CellIdentity {
  id?: string;
  phaseId?: string;
}

/** A fresh parser owns per-cell heading state; tokenization owns block nesting. */
export function renderNotebookMarkdown(
  source: string,
  cell: CellIdentity | null,
  counters: HeadingCounters | null
): string {
  const parser = createMarkdownParser();
  const originals = new Map<string, string[]>();
  for (const part of scanFencedMarkdown(source)) {
    if (part.kind !== 'fence') continue;
    const key = part.source.replace(/\r\n?/g, '\n');
    const queue = originals.get(key) || [];
    queue.push(part.source);
    originals.set(key, queue);
  }
  for (const queue of originals.values()) queue.reverse();
  const mathHtml = (formula: string, display: boolean) =>
    `<span data-type="latex-block" data-latex="${escapeHtml(formula.trim())}" data-display-mode="${display}"></span>`;
  parser.use({
    breaks: true,
    renderer: {
      heading({ depth, text, tokens }) {
        const body = this.parser.parseInline(tokens);
        const base = cell?.phaseId || cell?.id || '';
        if (depth < 3)
          return `<h${depth} data-level="${depth}"${base ? ` id="${escapeHtml(base)}" data-base-id="${escapeHtml(base)}" data-heading-key="${escapeHtml(base)}"` : ''}>${body}</h${depth}>`;
        const rawSlug = text
          .toLowerCase()
          .replace(/<[^>]+>/g, '')
          .replace(/[^a-z0-9\s-]/gi, '')
          .replace(/\s+/g, '-')
          .slice(0, 80);
        let occurrence = 1;
        if (counters && base) {
          if (!counters.has(base)) counters.set(base, new Map());
          const map = counters.get(base)!;
          occurrence = (map.get(rawSlug) || 0) + 1;
          map.set(rawSlug, occurrence);
        }
        const slug = occurrence > 1 ? `${rawSlug}-${occurrence}` : rawSlug;
        const id = base ? `${base}--${slug}` : slug;
        return `<h${depth} id="${escapeHtml(id)}" data-level="${depth}" data-base-id="${escapeHtml(base)}" data-heading-key="${escapeHtml(slug)}" data-occurrence="${occurrence}">${body}</h${depth}>`;
      },
      code(token) {
        const fence = standaloneFence(token.raw);
        // Marked accepts an unclosed fence through EOF; notebook source editing must
        // not invent its closing delimiter when projecting back to Markdown.
        if (!fence && /^ {0,3}(?:`{3,}|~{3,})/.test(token.raw)) {
          return `<p>${escapeHtml(token.raw.replace(/\n$/, '')).replace(/\n/g, '<br>')}</p>`;
        }
        const language = (token.lang || '').trim().split(/\s+/)[0].toLowerCase();
        const code = fence?.code ?? token.text;
        const normalized = fence?.source || '';
        const original = originals.get(normalized)?.pop() || normalized;
        if (language === 'mermaid')
          return `<div data-type="mermaid-block" data-code="${encodeURIComponent(code)}" data-source="${encodeURIComponent(original)}"></div>`;
        return `<pre data-type="fenced-code-block" data-language="${escapeHtml(language)}" data-source="${encodeURIComponent(original)}"><code>${escapeHtml(code)}</code></pre>`;
      },
      image({ href, text, title, raw }) {
        return `<span data-type="markdown-image" data-src="${escapeHtml(href)}" data-alt="${escapeHtml(text)}" data-title="${escapeHtml(title || text)}" data-markdown="${escapeHtml(raw)}"></span>`;
      },
    },
    extensions: [
      {
        name: 'notebookDisplayMath',
        level: 'block',
        tokenizer(text) {
          const match = /^(?:\$\$([^$]+)\$\$|\$([^$\n]+)\$)[ \t]*(?:\n|$)/.exec(text);
          if (match)
            return { type: 'notebookDisplayMath', raw: match[0], formula: match[1] || match[2] };
        },
        renderer: (token) => `<p>${mathHtml(token.formula, true)}</p>`,
      },
      {
        name: 'notebookInlineMath',
        level: 'inline',
        start: (text) => text.indexOf('$'),
        tokenizer(text) {
          const match = /^(?:\$\$([^$]+)\$\$|\$([^$\n]+)\$)/.exec(text);
          if (match)
            return { type: 'notebookInlineMath', raw: match[0], formula: match[1] || match[2] };
        },
        renderer: (token) => mathHtml(token.formula, false),
      },
    ],
  });
  return parser.parse(source, { async: false });
}
