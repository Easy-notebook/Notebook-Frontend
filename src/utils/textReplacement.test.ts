import { expect, it } from 'vitest';
import { textReplacement } from './textReplacement';

it('reconstructs every pair of empty, Unicode and mixed-newline buffers exactly', () => {
  const values = ['', 'a', 'aa', 'ba', '中文🐍', '中文🐎', '\r\n', '\n', 'a\r\nb\nc', '\ud800', '\udc00'];
  for (const previous of values) {
    for (const next of values) {
      const { from, to, insert } = textReplacement(previous, next);
      expect(previous.slice(0, from) + insert + previous.slice(to)).toBe(next);
      expect(from).toBeLessThanOrEqual(to);
      expect(to).toBeLessThanOrEqual(previous.length);
    }
  }
});

it('restricts the replacement to changed text while retaining shared prefix and suffix', () => {
  expect(textReplacement('prefix OLD suffix', 'prefix NEW suffix')).toEqual({
    from: 7, to: 10, insert: 'NEW',
  });
  expect(textReplacement('same', 'same')).toEqual({ from: 4, to: 4, insert: '' });
});
