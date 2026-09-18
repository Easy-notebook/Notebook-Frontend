import { Marked } from 'marked';

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const createMarkdownParser = () =>
  new Marked({
    gfm: true,
    renderer: {
      // GFM tables cannot contain physical newlines inside a cell. Accept only
      // the attribute-free break emitted by serialization; all other HTML stays literal.
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
