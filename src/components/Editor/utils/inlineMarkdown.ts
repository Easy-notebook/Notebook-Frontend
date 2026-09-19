import { Marked } from 'marked';

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GFM splits table cells before parsing inline code; entities keep delimiters literal. */
export function encodeTableCode(text: string): string {
  return `<code>${text.replace(/[&<>"|\\`*_[\]~!$]/g, (character) => `&#${character.charCodeAt(0)};`)}</code>`;
}

export const createMarkdownParser = () =>
  new Marked({
    gfm: true,
    extensions: [
      {
        name: 'notebookLiteralCode',
        level: 'inline',
        // The built-in HTML token boundary already stops text at <code>, so no
        // repeated scan of the remaining input is needed to find this extension.
        tokenizer(source) {
          // Stop at another opening tag instead of rescanning the entire suffix
          // for every opener in a malformed fragment.
          const match = /^<code[ \t]*>((?:(?!<code\b)[^\r\n])*?)<\/code[ \t]*>/i.exec(source);
          if (match) return { type: 'notebookLiteralCode', raw: match[0], payload: match[1] };
        },
        // Keep entities as text entities, but never allow child tags or attributes.
        // Parsing the whole pair also prevents Markdown escapes/math inside code.
        renderer: (token) =>
          `<code>${String(token.payload).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`,
      },
    ],
    renderer: {
      // GFM tables cannot contain physical newlines inside a cell. Accept only
      // the attribute-free break emitted by serialization; other unrecognized HTML stays literal.
      html: ({ text }) => (/^<br[ \t]*\/?>$/i.test(text) ? '<br>' : escapeHtml(text)),
      link({ href, title, tokens }) {
        const label = this.parser.parseInline(tokens);
        // Remove URL control characters before checking the scheme, including embedded NUL.
        // eslint-disable-next-line no-control-regex
        const scheme = /^([a-z][a-z\d+.-]*):/i.exec(href.replace(/[\u0000-\u0020]/g, ''));
        if (scheme && !/^(https?|mailto|tel)$/i.test(scheme[1])) return label;
        return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${label}</a>`;
      },
    },
  });

const parser = createMarkdownParser();

export function renderInlineMarkdown(source: string): string {
  return parser.parseInline(source, { async: false });
}
