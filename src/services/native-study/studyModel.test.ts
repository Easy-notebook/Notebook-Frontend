import { describe, expect, it } from 'vitest';
import { nativeView } from './contracts';
import { studyModelExport } from './studyModel';

const model = {
  version: 1,
  training_rows: 12,
  features: [
    { name: 'area', mean: 104.83333333333333, scale: 33.2 },
    { name: 'rooms', mean: 3, scale: 1.1 },
  ],
  centers: [
    [-1, -1],
    [1, 1],
  ],
};
const input = {
  frontend_notebook_id: 'notebook',
  document: {
    id: 'workspace',
    revision: 1,
    notebook: { status: 'Open', chapters: [] },
    messages: [],
  },
  recipients: [{ id: 'DataMining', label: 'DataMining', aliases: [] }],
  model_enabled: false,
  study: {
    input: null,
    current: true,
    result: {
      kind: 'mining',
      report: {
        reference_id: 'reference',
        inertia: 1,
        mean_silhouette: 0.5,
        clusters: [],
        model,
      },
    },
    comparison: null,
    practice: null,
    sample_evidence: null,
  },
};
describe('portable housing model export', () => {
  it('preserves all frozen scaling values through the actual response parser', () => {
    const view = nativeView.parse(input);
    expect(JSON.parse(studyModelExport(view))).toEqual(model);
  });
  it('rejects absent, stale and incomplete models', () => {
    const view = nativeView.parse(input);
    expect(() => studyModelExport({ ...view, study: { ...view.study, current: false } })).toThrow();
    expect(() => studyModelExport({ ...view, study: { ...view.study, result: null } })).toThrow();
    delete (view.study.result!.report.model.features[0] as Record<string, unknown>).scale;
    expect(() => studyModelExport(view)).toThrow('不完整');
  });
});
