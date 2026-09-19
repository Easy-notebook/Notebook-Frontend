import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
import { sanitizeTableSource } from './tableSource';
import { readTableSource } from '@Utils/markdown/tableBoundary';

describe('table source boundaries', () => {
  it('isolates table policy from hooks registered by diagram rendering', () => {
    const hook = (node: Element) => node.setAttribute?.('data-unrelated-hook', 'yes');
    DOMPurify.addHook('afterSanitizeAttributes', hook);
    try {
      expect(sanitizeTableSource('<table><tr><td>safe</td></tr></table>')).not.toContain(
        'data-unrelated-hook'
      );
    } finally {
      DOMPurify.removeHook('afterSanitizeAttributes', hook);
    }
  });
  it.each(['script', 'style', 'textarea', 'title'])(
    'ignores table delimiters inside HTML raw text: %s',
    (tag) => {
      const raw = `<table><tr><td><${tag}>"</table>"</${tag}>keep</td></tr></table>`;
      expect(readTableSource(`${raw}\n\nAfter`)).toEqual({ raw, complete: true });
    }
  );
  it('consumes malformed nested openers once without inventing closing tags', () => {
    const raw = '<table>\n\n'.repeat(2000);
    expect(readTableSource(raw)).toEqual({ raw, complete: false });
  });
  it('does not consume ordinary Markdown or similarly named tags', () => {
    expect(readTableSource('ordinary')).toBeUndefined();
    expect(readTableSource('<tableau>')).toBeUndefined();
  });
});
