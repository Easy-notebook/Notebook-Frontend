import { expect, it } from 'vitest';
import { NotebookWriteBaseline } from './NotebookWriteBaseline';

it('requires absence until loaded and preserves the loaded basis across repeated attempts', () => {
  const baseline = new NotebookWriteBaseline();
  expect(baseline.condition('a')).toEqual({ expectedContent: null });
  baseline.loaded('a', 0, 'loaded');
  expect(baseline.condition('a', 'newer external body')).toEqual({ expectedContent: 'loaded' });
  expect(baseline.condition('a')).toEqual({ expectedContent: 'loaded' });
  expect(baseline.condition('b')).toEqual({ expectedContent: null });
});

it('advances only an acknowledged commit and rejects an older changed load', () => {
  const baseline = new NotebookWriteBaseline();
  baseline.loaded('a', 0, 'first');
  const reading = baseline.generation('a');
  baseline.committed('a', 'second');
  expect(() => baseline.loaded('a', reading, 'first')).toThrow('changed while loading');
  expect(baseline.condition('a')).toEqual({ expectedContent: 'second' });
});

it('accepts concurrent equal loads without changing the content basis', () => {
  const baseline = new NotebookWriteBaseline();
  baseline.loaded('a', 0, 'equal');
  baseline.loaded('a', 0, 'equal');
  expect(baseline.condition('a')).toEqual({ expectedContent: 'equal' });
});

it('keeps observed absence distinct from an unobserved empty-save check', () => {
  const baseline = new NotebookWriteBaseline();
  expect(baseline.condition('a', 'empty document')).toEqual({ expectedContent: 'empty document' });
  baseline.loaded('a', 0, null);
  expect(baseline.condition('a', 'new document')).toEqual({ expectedContent: null });
});
