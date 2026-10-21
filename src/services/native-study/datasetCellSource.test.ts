import { expect, it } from 'vitest';
import {
  comparisonCellSource,
  comparisonWorkflowSources,
  datasetCellSource,
  evidenceCellSource,
} from './datasetCellSource';

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

it('emits a reusable reference and a query cell with no hidden refitting', () => {
  const [fit, compare] = comparisonWorkflowSources(
    'a'.repeat(64),
    'b'.repeat(64),
    ['area', 'rooms'],
    3,
    2,
    'housing-reference'
  );
  expect(fit).toContain(
    'self.skill("notebook_set", "housing-reference", {version: version, model: report.model'
  );
  expect(compare).toContain('self.skill("notebook_get", "housing-reference")');
  expect(compare).not.toContain('numeric_segments');
  expect(compare).toContain('reference.model, csv, query, 2, reference.reference_id');
  expect(() =>
    comparisonWorkflowSources('a'.repeat(64), 'b'.repeat(64), ['area'], 3, 2, 'bad"name')
  ).toThrow('名称');
});

it('generates evidence from a fresh pinned comparison using native fact and inference checks', () => {
  const source = evidenceCellSource('a'.repeat(64), 'b'.repeat(64), ['area{units}', 'rooms'], 3, 8);
  expect(source).toContain('"area{{units}}"');
  expect(source).toContain('effects(skill, memory.read, memory.write)');
  expect(source).toContain('self.skill("notebook_sample_evidence", comparison, 0)');
  expect(source).toContain('definition.atom, definition.predicate');
  expect(source).toContain('[projected.rule], projected.goal, 8');
  expect(source).toContain('knowledge.explain(answer.id)');
  expect(source).toContain('sample_evidence: sample_evidence');
  expect(() => evidenceCellSource('a'.repeat(64), '../other', ['area'], 3, 2)).toThrow('版本');
});
