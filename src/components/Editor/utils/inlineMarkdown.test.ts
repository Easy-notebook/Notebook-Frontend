import { describe, expect, it } from 'vitest';
import { renderInlineMarkdown } from './inlineMarkdown';
import { extractTextFromNode } from './cellConverters';

describe('inline Markdown fidelity', () => {
  it('renders links, strike and nested emphasis while preserving notebook placeholders', () => {
    const html = renderInlineMarkdown(
      '[link](https://example.com) ~~old~~ **bold *italic*** __LATEX_INLINE_0__'
    );
    expect(html).toContain('<a href="https://example.com">link</a>');
    expect(html).toContain('<del>old</del>');
    expect(html).toContain('<strong>bold <em>italic</em></strong>');
    expect(html).toContain('__LATEX_INLINE_0__');
  });
  it('does not interpret raw HTML or executable link targets', () => {
    expect(renderInlineMarkdown('<script>alert(1)</script>')).not.toContain('<script>');
    expect(renderInlineMarkdown('[bad](javascript:alert)')).not.toContain('href');
  });
  it.each(['a`b', '`edge`', '  padded  ', 'plain'])('round trips code span %s', (text) => {
    const markdown = extractTextFromNode({ type: 'text', text, marks: [{ type: 'code' }] });
    const container = document.createElement('div');
    container.innerHTML = renderInlineMarkdown(markdown);
    expect(container.querySelector('code')?.textContent).toBe(text);
  });
  it('serializes link destination, title and strikethrough', () => {
    const markdown = extractTextFromNode({
      type: 'text',
      text: 'label',
      marks: [
        { type: 'strike' },
        { type: 'link', attrs: { href: 'https://example.com/a(b)', title: 'A "title"' } },
      ],
    });
    const container = document.createElement('div');
    container.innerHTML = renderInlineMarkdown(markdown);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a(b)');
    expect(container.querySelector('a')?.getAttribute('title')).toBe('A "title"');
    expect(container.querySelector('del')?.textContent).toBe('label');
  });
});
