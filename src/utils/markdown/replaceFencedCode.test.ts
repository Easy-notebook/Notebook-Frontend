import { expect, it } from 'vitest';
import { replaceFencedCode, standaloneFence } from './fencedMarkdown';

it.each(['\n', '\r\n', '\r'])('retains wrapper bytes with %j newlines', newline => {
  const opening = `  ~~~~python custom  ${newline}`;
  const closing = ' ~~~~~  \t';
  const source = `${opening}old${newline}${closing}`;
  const fence = standaloneFence(source)!;
  expect(replaceFencedCode(fence, 'new')).toBe(`${opening}new${newline}${closing}`);
  expect(replaceFencedCode(fence, 'old')).toBe(source);
});

it.each(['', 'x', 'x\r', 'x\n', 'x\r\n', 'x\n```\ny'])('round trips payload %j in empty and populated fences', code => {
  for (const newline of ['\n', '\r\n', '\r']) {
    for (const body of ['', `old${newline}`]) {
      const fence = standaloneFence(`  \`\`\`python  ${newline}${body} \`\`\`\`\`  `)!;
      const result = replaceFencedCode(fence, code);
      expect(standaloneFence(result)?.code).toBe(code);
      expect(result.endsWith(' `````  ')).toBe(true);
    }
  }
});

it('grows both delimiters only as far as required by embedded closing candidates', () => {
  const fence = standaloneFence(' ~~~js custom \nold\n  ~~~~\t')!;
  const code = 'x\n~~~~~\ny';
  const result = replaceFencedCode(fence, code);
  expect(result).toBe(' ~~~~~~js custom \n' + code + '\n  ~~~~~~\t');
  expect(standaloneFence(result)?.code).toBe(code);
});
