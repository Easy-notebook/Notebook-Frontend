import { describe, expect, it } from 'vitest';
import { encodeTableCode, renderInlineMarkdown } from './inlineMarkdown';
import { marked } from 'marked';
import { extractTextFromNode } from './cellConverters';
import { convertMarkdownToHtml } from './markdownConverters';

describe('inline Markdown fidelity', () => {
  it('keeps repeated unfinished code tags literal', () => {
    const source = '<code>'.repeat(2000);
    const element = document.createElement('div');
    element.innerHTML = renderInlineMarkdown(source);
    expect(element.querySelector('code')).toBeNull();
    expect(element.textContent).toBe(source);
  });
  it('exports table code using standard HTML entities understood by a plain GFM parser', () => {
    const text = 'a\\|`b` **literal** ~~strike~~ [x](https://example.com) <tag> &amp; 中文';
    const element = document.createElement('div');
    element.innerHTML = marked.parse(
      `| Code | Other |\n| --- | --- |\n| ${encodeTableCode(text)} | keep |`,
      { async: false }
    );
    expect(element.querySelectorAll('tbody td')).toHaveLength(2);
    expect(element.querySelector('tbody td code')?.textContent).toBe(text);
  });
  it.each([
    ['bold', 'strong'],
    ['italic', 'em'],
    ['strike', 'del'],
  ])('preserves %s text with boundary whitespace', (type, tag) => {
    const source = extractTextFromNode({
      type: 'text',
      text: '  marked text  ',
      marks: [{ type }],
    });
    const container = document.createElement('div');
    container.innerHTML = renderInlineMarkdown(source);
    expect(container.textContent).toBe('  marked text  ');
    expect(container.querySelector(tag)?.textContent).toBe('marked text');
  });
  it('does not emit empty formatting delimiters for whitespace-only marks', () => {
    expect(extractTextFromNode({ type: 'text', text: '   ', marks: [{ type: 'bold' }] })).toBe(
      '   '
    );
  });
  it.each([
    '**literal**',
    '[not a link](https://example.com)',
    '# not a heading',
    '10. not a list',
    '- not a list',
    '$not math$',
    '&copy;',
    'a | b',
    '`not code`',
  ])('preserves unformatted literal text: %s', (text) => {
    const source = extractTextFromNode({ type: 'text', text });
    const container = document.createElement('div');
    container.innerHTML = convertMarkdownToHtml(source);
    expect(container.textContent?.trimEnd()).toBe(text);
    expect(
      container.querySelector('strong, a, h1, ol, ul, code, [data-type="latex-block"]')
    ).toBeNull();
  });
  it('keeps bold code semantic regardless of mark order', () => {
    const source = extractTextFromNode({
      type: 'text',
      text: 'a*b',
      marks: [{ type: 'bold' }, { type: 'code' }],
    });
    const container = document.createElement('div');
    container.innerHTML = renderInlineMarkdown(source);
    expect(container.querySelector('strong code')?.textContent).toBe('a*b');
  });
  it('renders links, strike and nested emphasis', () => {
    const html = renderInlineMarkdown('[link](https://example.com) ~~old~~ **bold *italic***');
    expect(html).toContain('<a href="https://example.com">link</a>');
    expect(html).toContain('<del>old</del>');
    expect(html).toContain('<strong>bold <em>italic</em></strong>');
  });
  it('does not interpret raw HTML or executable link targets', () => {
    expect(renderInlineMarkdown('<script>alert(1)</script>')).not.toContain('<script>');
    expect(renderInlineMarkdown('[bad](javascript:alert)')).not.toContain('href');
  });
  it('allows complete attribute-free literal code without activating nested HTML or Markdown', () => {
    const source =
      'Before <code><img src=x onerror=alert(1)> **not bold** $not math$ &#124; &#92;</code> after';
    const element = document.createElement('div');
    element.innerHTML = convertMarkdownToHtml(source);
    expect(element.querySelector('img, strong, [data-type="latex-block"]')).toBeNull();
    expect(element.querySelector('code')?.textContent).toBe(
      '<img src=x onerror=alert(1)> **not bold** $not math$ | \\'
    );
  });
  it.each([
    '<code onclick="alert(1)">x</code>',
    '<code style="color:red">x</code>',
    '<code>unfinished',
  ])('does not enable attributed or incomplete code markup: %s', (source) => {
    const element = document.createElement('div');
    element.innerHTML = renderInlineMarkdown(source);
    expect(element.querySelector('code')).toBeNull();
    expect(element.textContent).toBe(source);
  });
  it.each(['<br>', '<BR/>', '<br />'])(
    'allows only attribute-free hard break markup: %s',
    (source) => {
      const element = document.createElement('div');
      element.innerHTML = renderInlineMarkdown(`first${source}last`);
      expect(element.querySelectorAll('br')).toHaveLength(1);
      expect(element.textContent).toBe('firstlast');
    }
  );
  it.each([
    '<br onmouseover="alert(1)">',
    '<br style="color:red">',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
  ])('does not activate attributed or other HTML: %s', (source) => {
    const element = document.createElement('div');
    element.innerHTML = renderInlineMarkdown(source);
    expect(element.childElementCount).toBe(0);
    expect(element.textContent).toBe(source);
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
