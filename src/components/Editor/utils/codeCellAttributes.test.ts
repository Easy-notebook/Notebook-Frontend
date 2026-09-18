import { describe, expect, it } from 'vitest';
import { codeCellFromAttributes, decodeCodeOutputs } from './codeCellAttributes';

describe('code cell attribute boundary', () => {
  it('decodes source exactly once and preserves the language before store hydration', () => {
    const content = 'console.log("中文 %20 <tag>")\n';
    expect(
      codeCellFromAttributes(
        { code: encodeURIComponent(content), language: 'js', outputs: '[]' },
        'code'
      )
    ).toMatchObject({ id: 'code', content, language: 'javascript', outputs: [] });
  });
  it('preserves output arrays without copying and supports encoded HTML output', () => {
    const outputs = [{ output_type: 'stream', text: '100% complete' }];
    expect(decodeCodeOutputs(outputs)).toBe(outputs);
    expect(decodeCodeOutputs(encodeURIComponent(JSON.stringify(outputs)))).toEqual(outputs);
    expect(decodeCodeOutputs(JSON.stringify(outputs))).toEqual(outputs);
  });
  it('does not expose malformed or non-array outputs to code views', () => {
    for (const value of ['{}', 'null', 'broken', '%', undefined]) {
      expect(decodeCodeOutputs(value)).toEqual([]);
    }
  });
});
