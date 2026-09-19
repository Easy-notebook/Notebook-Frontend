import DOMPurify from 'dompurify';
import type { JSONContent } from '@tiptap/core';
import { escapeHtml } from './inlineMarkdown';

// Mermaid installs hooks on the default sanitizer. Table policy owns an isolated instance.
let tablePurifier: ReturnType<typeof DOMPurify> | undefined;

/** HTML containers own structure; fenced source stays editable rather than being reparsed here. */
export function serializeTableBlock(
  node: JSONContent,
  fence: (node: JSONContent) => string
): string {
  const attrs = node.attrs || {};
  if (node.type === 'fencedCodeBlock' || node.type === 'mermaidBlock')
    return `<pre data-type="fenced-code-source"><code>${escapeHtml(fence(node))}</code></pre>`;
  if (node.type === 'table')
    return serializeHtmlTable(node, (child) => serializeTableBlock(child, fence));
  if (node.type === 'hardBreak') return '<br>';
  if (node.type === 'horizontalRule') return '<hr>';
  if (node.type === 'latexBlock')
    return `<span data-type="latex-block" data-latex="${escapeHtml(attrs.latex || '')}" data-display-mode="${!!attrs.displayMode}"></span>`;
  if (node.type === 'markdownImage')
    return `<span data-type="markdown-image"${['src', 'alt', 'title', 'markdown'].map((key) => ` data-${key}="${escapeHtml(attrs[key] || '')}"`).join('')}></span>`;
  if (node.type === 'text') {
    let text = escapeHtml(node.text || '');
    for (const mark of [...(node.marks || [])].reverse()) {
      const tag = { bold: 'strong', italic: 'em', strike: 's', code: 'code' }[mark.type];
      if (tag) text = `<${tag}>${text}</${tag}>`;
      else if (mark.type === 'link')
        text = `<a href="${escapeHtml(mark.attrs?.href || '')}"${mark.attrs?.title ? ` title="${escapeHtml(mark.attrs.title)}"` : ''}>${text}</a>`;
    }
    return text;
  }
  const body = (node.content || []).map((child) => serializeTableBlock(child, fence)).join('');
  if (node.type === 'heading') return `<h${attrs.level || 1}>${body}</h${attrs.level || 1}>`;
  if (node.type === 'orderedList')
    return `<ol start="${Number.isSafeInteger(attrs.start) ? attrs.start : 1}">${body}</ol>`;
  const tag = { paragraph: 'p', blockquote: 'blockquote', bulletList: 'ul', listItem: 'li' }[
    node.type || ''
  ];
  if (!tag) throw new Error(`Unsupported rich table node: ${node.type}`);
  return `<${tag}>${body}</${tag}>`;
}

/** GFM has one paragraph per cell and one alignment per column. */
export function requiresHtmlTable(table: JSONContent): boolean {
  const rows = table.content || [];
  const header = rows[0]?.content || [];
  return rows.some((row, rowIndex) =>
    (row.content || []).some(
      (cell, column) =>
        cell.type !== (rowIndex === 0 ? 'tableHeader' : 'tableCell') ||
        (cell.attrs?.colspan ?? 1) !== 1 ||
        (cell.attrs?.rowspan ?? 1) !== 1 ||
        cell.attrs?.colwidth != null ||
        (cell.attrs?.textAlign ?? null) !== (header[column]?.attrs?.textAlign ?? null) ||
        cell.content?.length !== 1 ||
        cell.content[0].type !== 'paragraph'
    )
  );
}

/** Only the table subtree is visited; the caller owns block serialization. */
export function serializeHtmlTable(
  table: JSONContent,
  renderBlock: (node: JSONContent) => string
): string {
  return `<table>\n${(table.content || [])
    .map(
      (row) =>
        `<tr>${(row.content || [])
          .map((cell) => {
            const tag = cell.type === 'tableHeader' ? 'th' : 'td';
            const attrs = cell.attrs || {};
            const span = ['colspan', 'rowspan']
              .map((name) =>
                Number.isSafeInteger(attrs[name]) && attrs[name] > 1
                  ? ` ${name}="${attrs[name]}"`
                  : ''
              )
              .join('');
            const widths =
              Array.isArray(attrs.colwidth) &&
              attrs.colwidth.every(
                (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
              )
                ? ` colwidth="${attrs.colwidth.join(',')}"`
                : '';
            const align = /^(left|center|right)$/.test(attrs.textAlign || '')
              ? ` align="${attrs.textAlign}"`
              : '';
            const body = (cell.content || []).map(renderBlock).join('');
            return `<${tag}${span}${widths}${align}>${body}</${tag}>`;
          })
          .join('')}</tr>`
    )
    .join('\n')}\n</table>`;
}

/** Raw HTML is enabled only for a complete table, never as general HTML passthrough. */
export function sanitizeTableSource(
  source: string,
  renderFence?: (source: string) => string
): string | null {
  if (!/^<table(?:\s[^>]*)?>[\s\S]*<\/table>\s*$/i.test(source)) return null;
  const purifier = (tablePurifier ??= DOMPurify(window));
  const fragment = purifier.sanitize(source, {
    ALLOWED_TAGS: [
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      's',
      'del',
      'code',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'a',
      'span',
      'div',
    ],
    ALLOWED_ATTR: [
      'colspan',
      'rowspan',
      'colwidth',
      'align',
      'href',
      'title',
      'start',
      'data-type',
      'data-language',
      'data-source',
      'data-code',
      'data-latex',
      'data-display-mode',
      'data-src',
      'data-alt',
      'data-title',
      'data-markdown',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const element of fragment.querySelectorAll('*')) {
    if (
      ![
        'fenced-code-block',
        'fenced-code-source',
        'mermaid-block',
        'latex-block',
        'markdown-image',
      ].includes(element.getAttribute('data-type') || '')
    )
      element.removeAttribute('data-type');
    for (const name of ['data-code', 'data-source']) {
      if (!element.hasAttribute(name)) continue;
      try {
        decodeURIComponent(element.getAttribute(name)!);
      } catch {
        element.removeAttribute(name);
      }
    }
    const src = element.getAttribute('data-src');
    // Custom image attributes must receive the same URI checks as native links.
    // eslint-disable-next-line no-control-regex
    const scheme = src && /^([a-z][a-z\d+.-]*):/i.exec(src.replace(/[\u0000-\u0020]/g, ''));
    if (scheme && !/^(https?|blob)$/i.test(scheme[1])) element.removeAttribute('data-src');
    if (element.tagName === 'PRE') {
      if (element.getAttribute('data-type') === 'fenced-code-source' && renderFence) {
        const replacement = document.createElement('template');
        replacement.innerHTML = renderFence(element.textContent || '');
        element.replaceWith(replacement.content);
      } else element.setAttribute('data-type', 'fenced-code-block');
    }
  }
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}
