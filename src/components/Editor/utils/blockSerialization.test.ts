import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { serializeMarkdownBlock } from './cellConverters';

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const item = (...content: any[]) => ({ type: 'listItem', content });
const list = (...content: any[]) => ({ type: 'bulletList', content });
function parse(node: any) {
  const element = document.createElement('div');
  element.innerHTML = marked.parse(serializeMarkdownBlock(node), { async: false });
  return element;
}

describe('structure-preserving block serialization', () => {
  it('keeps nested list depth and separate paragraphs in one item', () => {
    const element = parse(
      list(
        item(paragraph('first'), paragraph('second'), list(item(paragraph('nested')))),
        item(paragraph('next'))
      )
    );
    expect(element.querySelectorAll(':scope > ul > li')).toHaveLength(2);
    expect(element.querySelector('ul > li > ul > li')?.textContent).toBe('nested');
    expect(element.querySelectorAll('ul > li:first-child > p')).toHaveLength(2);
  });
  it('retains ordered-list start and indents continuations under double-digit markers', () => {
    const node = {
      type: 'orderedList',
      attrs: { start: 10 },
      content: [item(paragraph('first'), paragraph('continued')), item(paragraph('next'))],
    };
    const element = parse(node);
    expect(element.querySelector('ol')?.getAttribute('start')).toBe('10');
    expect(element.querySelectorAll('ol > li')).toHaveLength(2);
    expect(element.querySelector('li')?.textContent).toContain('continued');
  });
  it('prefixes every quoted line and preserves nested code fences', () => {
    const node = {
      type: 'blockquote',
      content: [
        paragraph('first'),
        {
          type: 'fencedCodeBlock',
          attrs: { language: 'python' },
          content: [{ type: 'text', text: 'print(1)\nprint(2)' }],
        },
        paragraph('last'),
      ],
    };
    const element = parse(node);
    expect(element.querySelector('blockquote pre code')?.textContent).toBe('print(1)\nprint(2)\n');
    expect(element.querySelectorAll('blockquote > p')).toHaveLength(2);
    expect(element.querySelectorAll(':scope > *')).toHaveLength(1);
  });
});
