import { Marked } from 'marked';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const parser = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      // Remove URL control characters before checking the scheme, including embedded NUL.
      // eslint-disable-next-line no-control-regex
      const scheme = /^([a-z][a-z\d+.-]*):/i.exec(href.replace(/[\u0000-\u0020]/g, ''));
      if (scheme && !/^(https?|mailto|tel)$/i.test(scheme[1])) return label;
      return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${label}</a>`;
    },
  },
  extensions: [
    {
      name: 'notebookPlaceholder',
      level: 'inline',
      start: (source) => source.search(/__(?:IMAGE|LATEX_BLOCK|LATEX_INLINE)_\d+__/),
      tokenizer(source) {
        const match = /^__(?:IMAGE|LATEX_BLOCK|LATEX_INLINE)_\d+__/.exec(source);
        if (match) return { type: 'notebookPlaceholder', raw: match[0] };
      },
      renderer: (token) => token.raw,
    },
  ],
});

export function renderInlineMarkdown(source: string): string {
  return parser.parseInline(source, { async: false });
}
