import { expect, it } from 'vitest';
import type { NativeView } from './contracts';
import { studyMarkdown } from './studyExport';

function snapshot(): NativeView {
  return {
    frontend_notebook_id: 'notebook',
    recipients: [{ id: 'mining', label: 'Mining', aliases: [] }],
    model_enabled: false,
    document: {
      id: 'workspace',
      revision: 4,
      messages: [],
      notebook: { status: 'Open', chapters: [] },
    },
    study: {
      current: true,
      input: null,
      comparison: null,
      practice: null,
      sample_evidence: null,
      result: {
        kind: 'mining',
        report: {
          reference_id: 'reference',
          clusters: [],
          mean_silhouette: 0.8,
          inertia: 0,
          model: { features: [{ name: 'area' }, { name: 'rooms' }] },
        },
      },
      figure: {
        name: 'housing-clusters.svg',
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>面积 (原始单位) `</text></svg>',
        reference_id: 'reference',
        selected_data_id: 'selected',
        input_csv_sha256: 'a'.repeat(64),
        x_feature: 'area',
        y_feature: 'rooms',
        reference_rows: 3,
        caption: 'Projection only',
        points: [{ row: 0, cluster: 0, x: 40, y: 2 }],
      },
    },
  };
}
it('exports one exact image snapshot and retains coordinates without duplicate SVG markup', () => {
  const view = snapshot();
  const markdown = studyMarkdown(view);
  const image = markdown.match(/!\[房屋分群图\]\(([^)]+)\)/);
  expect(image).not.toBeNull();
  expect(decodeURIComponent(image![1].split(',')[1])).toBe(view.study.figure!.svg);
  expect(markdown).not.toContain('<svg');
  const evidence = JSON.parse(markdown.match(/```json\n([\s\S]*?)\n```/)![1]);
  expect(evidence.study.figure.points).toEqual(view.study.figure!.points);
  expect(evidence.study.figure.reference_id).toBe('reference');
  expect(evidence.study.figure.svg).toBeUndefined();
  expect(view.study.figure!.svg).toContain('<svg');
});
it('refuses stale artifacts or an expired fit instead of publishing mismatched evidence', () => {
  const view = snapshot();
  view.study.figure!.reference_id = 'previous-reference';
  expect(() => studyMarkdown(view)).toThrow('图表参考数据');
  view.study.figure = null;
  view.study.current = false;
  expect(() => studyMarkdown(view)).toThrow('请先执行');
});
