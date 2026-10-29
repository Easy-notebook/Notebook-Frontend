import { it, expect } from 'vitest';
import { projectLedger } from './EalLedger';
it('projects live ledger timestamps and updates by native invocation identity', () => {
  const record = { invocation_ura: 'native-id', ability_name: 'notebook.agent', state: 'accepted', started_unix_ms: 12, completed_unix_ms: null };
  const graph = { trace_id: 'trace', records: [record], edges: [] };
  expect(projectLedger(graph, 'mission')[0]).toMatchObject({ id: 'native-id', status: 'queued', parentId: 'mission', startedAt: 12 });
  expect(projectLedger({ ...graph, records: [{ ...record, state: 'completed', completed_unix_ms: 80 }] }, 'mission')[0]).toMatchObject({ id: 'native-id', status: 'done', endedAt: 80 });
  expect(() => projectLedger({ ...graph, records: [{ ...record, state: 'imaginary' }] }, 'mission')).toThrow('Unrecognized');
});
it('does not turn causal dependency edges into invented parent-child calls', () => {
  const records = ['one', 'two'].map(invocation_ura => ({ invocation_ura, ability_name: 'run', state: 'running', started_unix_ms: 12, completed_unix_ms: null }));
  const spans = projectLedger({ trace_id: 'trace', records, edges: [{ from_invocation_ura: 'one', to_invocation_ura: 'two', relation: 'causal' }] }, 'mission');
  expect(spans.map(s => s.parentId)).toEqual(['mission', 'mission']);
});
