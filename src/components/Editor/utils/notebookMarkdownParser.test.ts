import { describe, expect, it } from 'vitest';
import { convertMarkdownToHtml } from './markdownConverters';

const parse = (source: string) => {
  const container = document.createElement('div');
  container.innerHTML = convertMarkdownToHtml(source, { id: 'cell' }, new Map());
  return container;
};
describe('notebook block parsing', () => {
  it('does not silently complete an unfinished code fence', () => {
    const root = parse('```python\nprint(1)');
    expect(root.querySelector('pre')).toBeNull();
    expect(root.textContent).toContain('```python');
  });
  it('preserves heading navigation and repeated subheading counters', () => {
    const root = parse('## Main\n\n### Sub\n\n### Sub');
    expect(root.querySelector('h2')?.id).toBe('cell');
    expect(Array.from(root.querySelectorAll('h3')).map((node) => node.id)).toEqual([
      'cell--sub',
      'cell--sub-2',
    ]);
  });
  it('keeps formulas and images alongside tables without placeholder loss', () => {
    const root = parse(
      '$x$\n\n| A | B |\n| --- | --- |\n| $y$ | ![alt](https://example.com/a.png) |'
    );
    expect(root.querySelectorAll('[data-type="latex-block"]')).toHaveLength(2);
    expect(root.querySelector('table [data-type="markdown-image"]')?.getAttribute('data-alt')).toBe(
      'alt'
    );
  });
  it('does not parse math or Mermaid examples inside literal code', () => {
    const root = parse('````markdown\n```mermaid\ngraph TD; A-->B\n```\n$x$\n````');
    expect(
      root.querySelectorAll('[data-type="mermaid-block"], [data-type="latex-block"]')
    ).toHaveLength(0);
    expect(root.querySelector('code')?.textContent).toContain('$x$');
  });
  it('retains CRLF source for an unchanged complete fence', () => {
    const source = '~~~python\r\nprint(1)\r\n~~~';
    const root = parse(source);
    expect(decodeURIComponent(root.querySelector('pre')!.getAttribute('data-source')!)).toBe(
      source
    );
  });
});
