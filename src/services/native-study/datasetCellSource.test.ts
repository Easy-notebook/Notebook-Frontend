import { expect, it } from 'vitest';
import { comparisonCellSource, datasetCellSource } from './datasetCellSource';

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

it('pins both comparison inputs and uses the measured reference identity', () => {
  const source = comparisonCellSource(
    'a'.repeat(64),
    'b'.repeat(64),
    ['area{units}', 'rooms'],
    3,
    2
  );
  expect(source).toContain('"area{{units}}"');
  expect(source).toContain(`query_version = "${'b'.repeat(64)}"`);
  expect(source).toContain('report.model, csv, query, 2, report.reference_id');
  expect(source).toContain('query_version: query_version, comparison: comparison');
  for (const neighbors of [0, 9, 1.2, NaN])
    expect(() =>
      comparisonCellSource('a'.repeat(64), 'b'.repeat(64), ['area'], 2, neighbors)
    ).toThrow('近邻');
  expect(() => comparisonCellSource('a'.repeat(64), '../query.csv', ['area'], 2, 1)).toThrow(
    '版本'
  );
});
