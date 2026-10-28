import DOMPurify from 'dompurify';
let tablePurifier: ReturnType<typeof DOMPurify> | undefined;

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
