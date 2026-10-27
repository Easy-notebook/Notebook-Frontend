import { render, screen, within, fireEvent } from '@testing-library/react';
import { expect, it } from 'vitest';
import { sampleEvidence, sampleConclusions } from '@Services/native-study/sampleEvidence';
import { SampleEvidence } from './SampleEvidence';

function fixture() {
  const literal = (value: string | number) => ({ literal: value });
  const terms = ['query-v1', 0, 'reference-v1', 2, 1, 0, 0.25].map(literal);
  const source = { agent: 'NotebookWorkspace', invocation: 'measured-call', call_id: 'fact-step' };
  const assigned = {
    id: 'assigned',
    status: 'supported',
    text: 'Measured assignment',
    source,
    atom: { relation: 'housing_assigned', terms: ['query-v1', 0, 'reference-v1', 1].map(literal) },
    premises: [],
  };
  const neighbor = { ...assigned, id: 'neighbor', atom: { relation: 'housing_neighbor', terms } };
  const atom = { relation: 'housing_same_segment_neighbor', terms };
  const root = {
    ...assigned,
    id: 'conclusion',
    atom,
    premises: [assigned, neighbor].map((fact) => ({
      id: fact.id,
      status: fact.status,
      assessment_revision: 1,
      current_revision: 1,
    })),
  };
  return {
    current: true,
    observation: {
      query_data_id: 'query-v1',
      reference_id: 'reference-v1',
      query_row: 0,
      cluster: 1,
    },
    facts: [assigned, neighbor],
    answers: [{ id: root.id, atom }],
    graphs: [{ root: root.id, nodes: { assigned, neighbor, conclusion: root } }],
  };
}
it('renders measured conclusions, pinned premises and actual invocation provenance', () => {
  render(<SampleEvidence evidence={sampleEvidence.parse(fixture())} />);
  expect(screen.getByText('证据对应当前研究')).toBeInTheDocument();
  const summary = screen.getByText('参考行 2 · 分群 1 · 已支持');
  fireEvent.click(summary);
  const detail = summary.closest('details')!;
  expect(within(detail).getByText('近邻序号 0 · 标准化距离平方 0.250000')).toBeVisible();
  expect(within(detail).getAllByText('引用评估修订 1 · 当前修订 1')).toHaveLength(2);
  expect(within(detail).getAllByText('measured-call')).toHaveLength(3);
});
it('reads changed graph states instead of treating the saved answer as current support', () => {
  const value = fixture();
  value.current = false;
  for (const fact of value.facts) fact.status = 'stale';
  for (const node of Object.values(value.graphs[0].nodes)) node.status = 'stale';
  const evidence = sampleEvidence.parse(value);
  expect(sampleConclusions(evidence)[0].root.status).toBe('stale');
  render(<SampleEvidence evidence={evidence} />);
  expect(screen.getByText(/历史证据已过期/)).toBeInTheDocument();
  expect(screen.getByText('参考行 2 · 分群 1 · 已过期')).toBeInTheDocument();
  expect(screen.queryByText('参考行 2 · 分群 1 · 已支持')).not.toBeInTheDocument();
});
it('keeps an empty answer set distinct from a negative universal conclusion', () => {
  const value = fixture();
  value.answers = [];
  value.graphs = [];
  render(<SampleEvidence evidence={sampleEvidence.parse(value)} />);
  expect(screen.getByText(/没有返回同群近邻推导/)).toBeInTheDocument();
});
it.each(['root', 'premise', 'query', 'atom', 'duplicate', 'node-id', 'nonfinite'])(
  'rejects inconsistent evidence: %s',
  (fault) => {
    const value = fixture();
    const root = value.graphs[0].nodes.conclusion;
    if (fault === 'root') value.graphs[0].root = 'absent';
    if (fault === 'premise') root.premises[0].id = 'absent';
    if (fault === 'query') value.observation.query_data_id = 'other';
    if (fault === 'atom') root.atom = { ...root.atom, relation: 'other' };
    if (fault === 'duplicate') value.answers.push(value.answers[0]);
    if (fault === 'node-id') root.id = 'other';
    if (fault === 'nonfinite') root.atom.terms[6].literal = Infinity;
    expect(sampleEvidence.safeParse(value).success).toBe(false);
  }
);
