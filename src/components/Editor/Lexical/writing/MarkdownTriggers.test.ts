import { describe, it, expect } from 'vitest';
import { markdownTriggers } from './MarkdownTriggers';
describe('active Markdown delimiters', () => {
  it('activates unfinished bold immediately', () => {
    expect(markdownTriggers('**draft')).toEqual([
      { start: 0, end: 2, kind: 'emphasis', state: 'pending' },
    ]);
  });
  it('pairs completed delimiters while leaving escapes and code opaque', () => {
    expect(markdownTriggers('**bold**').map((t) => t.state)).toEqual(['complete', 'complete']);
    expect(markdownTriggers('\\**literal').filter((t) => t.start === 1)).toHaveLength(0);
    expect(markdownTriggers('`**literal**`').map((t) => t.kind)).toEqual(['code', 'code']);
  });
  it('treats heading markers as one run on the current line', () => {
    expect(markdownTriggers('###### Sixth')[0]).toMatchObject({ start: 0, end: 6, kind: 'block' });
    expect(markdownTriggers('text # elsewhere')).toEqual([]);
  });
  it('activates link label and destination delimiters', () => {
    expect(
      markdownTriggers('[reference](https://example.com)')
        .filter((t) => t.kind === 'link')
        .map((t) => t.state)
    ).toEqual(['complete', 'complete', 'complete']);
    expect(markdownTriggers('[reference](').every((t) => t.state === 'pending')).toBe(true);
  });
});
