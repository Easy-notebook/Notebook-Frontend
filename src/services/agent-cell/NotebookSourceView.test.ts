import { describe, expect, it } from 'vitest';
import { cellSourceDetail, cellSourceIndex } from './NotebookSourceView';

describe('two-level source coordinates', () => {
  it('counts cells at document level and preserves exact internal source including empty lines', () => {
    const source = 'first\r\n\nlast\n';
    expect(cellSourceIndex({ id: 'code', type: 'code', content: source }, 7)).toMatchObject({
      lineNumber: 8,
      preview: 'first last ',
    });
    const detail = cellSourceDetail(source);
    expect(detail.lines.map((line) => line.lineNumber)).toEqual([1, 2, 3, 4]);
    expect(detail.lines.map((line) => line.text).join('\n')).toBe(source);
    expect(detail.content).toBe(source);
    expect(cellSourceDetail('next cell').lines[0].lineNumber).toBe(1);
  });
});
