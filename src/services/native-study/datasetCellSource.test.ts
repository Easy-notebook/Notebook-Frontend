import { expect, it } from 'vitest';
import { datasetCellSource } from './datasetCellSource';

it('quotes column names using AAL interpolation escapes and pins exactly one version', () => {
  const source = datasetCellSource('a'.repeat(64), ['area{units}', 'rooms "count"', '路径\\值'], 3);
  expect(source).toContain('["area{{units}}", "rooms \\"count\\"", "路径\\\\值"], 3)');
  expect(source).toContain('self.skill("notebook_csv", version)');
  expect(source).not.toContain('read_file');
});
it('rejects malformed versions and unsupported or ambiguous settings before publication', () => {
  for (const version of ['../x.csv', 'A'.repeat(64), '']) {
    expect(() => datasetCellSource(version, ['area'], 2)).toThrow('版本');
  }
  for (const columns of [[], ['area', 'area'], [''], ['a'.repeat(257)]]) {
    expect(() => datasetCellSource('a'.repeat(64), columns, 2)).toThrow('特征');
  }
  for (const clusters of [1, 17, 2.5, NaN]) {
    expect(() => datasetCellSource('a'.repeat(64), ['area'], clusters)).toThrow('数量');
  }
  expect(() => datasetCellSource('a'.repeat(64), ['a\b'], 2)).toThrow('控制字符');
});
