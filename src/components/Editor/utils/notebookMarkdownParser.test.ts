import { describe, expect, it } from 'vitest';
import { convertMarkdownToHtml } from './markdownConverters';

const parse = (source: string) => {
  const container = document.createElement('div');
  container.innerHTML = convertMarkdownToHtml(source, { id: 'cell' }, new Map());
  return container;
};
describe('notebook block parsing', () => {
  it('reads hand-formatted nested tables across blank lines without swallowing following Markdown', () => {
    const root = parse(
      '<table>\n\n<tr><td title="literal </table>"><p>first</p>\n\n<table><tr><td>nested</td></tr></table>\n\n<pre><code>a\n\nb</code></pre></td></tr>\n<!-- </table> -->\n</table>\n\nAfter **table**'
    );
    expect(root.querySelectorAll('table')).toHaveLength(2);
    expect(root.querySelector('pre code')?.textContent).toBe('a\n\nb');
    expect(root.querySelector('table strong')).toBeNull();
    expect(root.querySelector('strong')?.textContent).toBe('table');
  });
  it('keeps an unfinished outer table literal instead of repairing its missing delimiter', () => {
    const source = '<table>\n\n<tr><td><table><tr><td>x</td></tr></table>';
    const root = parse(source);
    expect(root.querySelector('table')).toBeNull();
    expect(root.textContent).toBe(source);
  });
  it('sanitizes rich table HTML without enabling arbitrary HTML or cell nodes', () => {
    const root = parse(
      '<table><tr><td onclick="bad()" style="position:fixed"><p>safe</p><script>bad()</script><a href="javascript:bad()">link</a><div data-type="executable-code-block" data-code="bad()"></div><span data-type="markdown-image" data-src="javascript:bad()"></span><pre data-source="%invalid"><code>x</code></pre></td></tr></table>'
    );
    expect(root.querySelector('table')).not.toBeNull();
    expect(
      root.querySelector(
        'script, [onclick], [style], [href], [data-src], [data-source], [data-type="executable-code-block"]'
      )
    ).toBeNull();
    expect(parse('<div onclick="bad()">literal</div>').querySelector('[onclick]')).toBeNull();
  });
  it('retains safe images and formulas inside rich table cells', () => {
    const root = parse(
      '<table><tr><td><p><span data-type="markdown-image" data-src="https://example.com/image.png" data-alt="example"></span><span data-type="latex-block" data-latex="x^2" data-display-mode="false"></span></p></td></tr></table>'
    );
    expect(root.querySelector('[data-type="markdown-image"]')?.getAttribute('data-src')).toBe(
      'https://example.com/image.png'
    );
    expect(root.querySelector('[data-type="latex-block"]')?.getAttribute('data-latex')).toBe('x^2');
  });
  it('does not silently complete an unfinished code fence', () => {
    const root = parse('```python\nprint(1)');
    expect(root.querySelector('pre')).toBeNull();
    expect(root.textContent).toContain('```python');
  });
  it.each(['\n', '\r\n', '\r'])(
    'keeps broken fences literal with %j pasted line separators',
    (newline) => {
      const root = parse(['~~~python', '  print("中文 🐍")', '', '~~'].join(newline));
      expect(root.querySelector('pre, [data-type="mermaid-block"]')).toBeNull();
      const paragraph = root.querySelector('p')!;
      expect(paragraph.innerHTML.split('<br>')).toEqual([
        '~~~python',
        '  print("中文 🐍")',
        '',
        '~~',
      ]);
    }
  );
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
