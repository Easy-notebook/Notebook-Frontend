import { vi } from 'vitest';
import type { WorkflowDraftInput } from '../WorkflowDesignClient';
export const hash = 'a'.repeat(64);
export const input: Omit<WorkflowDraftInput, 'invocation'> = {
  workspace: 'w',
  expected_revision: 1,
  reference_csv: 'area,rooms\n40,2\n80,4\n',
  query_csv: 'area,rooms\n41,2\n',
  columns: ['area', 'rooms'],
  clusters: 2,
  neighbors: 2,
  maximum: 0.1,
  goal: 'Select measured houses',
  name: 'HousingWorkflow',
};
export function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
export function workflowFixture() {
  let publicationId = '';
  let evidenceStatus = 'refuted';
  let loseDraft = false;
  let loseDiscussion = false;
  let loseExecution = false;
  let suspended = false;
  let loseContinuation = false;
  const calls: { route: string; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const route = url.split('/').pop()!;
    const body = JSON.parse(init.body as string);
    calls.push({ route, body });
    if (route === 'evidence')
      return {
        ok: true,
        json: async () => ({
          frontend_notebook_id: 'houses',
          workspace: body.workspace,
          revision: body.expected_revision,
          claim_id: body.claim_id,
          evidence: {
            id: body.claim_id,
            status: evidenceStatus,
            tree: 'practice',
            source: { agent: 'WorkflowEvidence', invocation: publicationId, call_id: 'call:one' },
          },
        }),
      };
    if (route === 'publish') publicationId = body.invocation;
    const request = route === 'publish' ? body.assessment : body;
    const execution = ['resume', 'assess', 'publish'].includes(route) ? request.execution : body;
    const context = route === 'draft' ? body : execution.context;
    const identity = {
      frontend_notebook_id: 'houses',
      workspace: context.workspace,
      revision: context.expected_revision,
      invocation: context.invocation,
      reference_id: 'reference-id',
      query_data_id: 'query-id',
    };
    const assessment = {
      contract: 'housing-neighbor-selection-v1',
      status: suspended ? 'pending' : 'mismatched',
      execution_id: context.invocation,
      operation_id: request.continuation_invocation ?? context.invocation,
      deployment: 'deployment:one',
      fingerprint: execution.expected_fingerprint,
      expected: {
        reference_id: 'reference-id',
        query_data_id: 'query-id',
        selection: [{ query_row: 0, selected_rows: [0] }],
        selected_count: 1,
      },
      observed: suspended ? null : { selected_count: 1 },
      mismatches: suspended ? [] : ['query_data_id', 'reference_id', 'selection'],
    };
    if (route === 'discuss') {
      if (loseDiscussion) {
        loseDiscussion = false;
        throw new Error('lost response');
      }
      const evidence = {
        owner: 'WorkflowEvidence',
        scope: 'measured_instance_only',
        claim_id: 'claim:one',
        status: 'refuted',
        source: { agent: 'WorkflowEvidence', invocation: publicationId, call_id: 'call:one' },
        applicable: true,
        input_mismatches: [],
        contract: 'housing-neighbor-selection-v1',
        execution_id: 'execute',
        operation_id: 'execute',
        deployment: 'deployment:one',
        fingerprint: hash,
        reference_id: identity.reference_id,
        query_data_id: identity.query_data_id,
        maximum_distance_squared: context.maximum,
        assessment_status: 'mismatched',
        assessment_mismatches: ['selection'],
      };
      return {
        ok: true,
        json: async () => ({
          ...identity,
          discussion: {
            answer: '这是实例反驳，不是普遍结论。',
            evidence_snapshot: evidence,
            evidence_current: true,
            current_evidence: evidence,
            interpretation_only: true,
          },
        }),
      };
    }
    if (route === 'assess') return { ok: true, json: async () => ({ ...identity, assessment }) };
    if (route === 'publish')
      return {
        ok: true,
        json: async () => ({
          ...identity,
          publication_invocation: body.invocation,
          publication: {
            assessment: {
              ...assessment,
              maximum_distance_squared: context.maximum,
              field_matches: {
                reference_id: false,
                query_data_id: false,
                selection: false,
                selected_count: true,
              },
            },
            evidence: {
              id: 'claim:one',
              status: 'refuted',
              tree: 'practice',
              source: {
                agent: 'WorkflowEvidence',
                invocation: body.invocation,
                call_id: 'call:one',
              },
            },
          },
        }),
      };
    if (
      (route === 'draft' && loseDraft) ||
      (route === 'execute' && loseExecution) ||
      (route === 'resume' && loseContinuation)
    ) {
      loseDraft = false;
      loseExecution = false;
      loseContinuation = false;
      throw new Error('lost response');
    }
    return {
      ok: true,
      json: async () =>
        route === 'draft'
          ? {
              ...identity,
              execution_authorized: false,
              draft: {
                draft: 'draft:one',
                source: 'agent HousingWorkflow is Agent',
                checked: { valid: true, fingerprint: hash },
                inspection: {
                  name: context.name,
                  owned: true,
                  public: { abilities: ['analyze'] },
                  state: null,
                  revision: 1,
                },
              },
            }
          : {
              ...identity,
              ...(route === 'resume' ? { execution_invocation: body.execution_invocation } : {}),
              result: {
                deployment: 'deployment:one',
                fingerprint: execution.expected_fingerprint,
                execution: suspended
                  ? { status: 'suspended', workflow: 'work', state: 'wait', invocation: 'child' }
                  : { status: 'completed', value: { selected_count: 1 } },
              },
            },
    };
  });
  vi.stubGlobal('fetch', fetch);
  return {
    calls,
    fetch,
    stale: () => {
      evidenceStatus = 'stale';
    },
    loseDiscussion: () => {
      loseDiscussion = true;
    },
    loseDraft: () => {
      loseDraft = true;
    },
    loseExecution: () => {
      loseExecution = true;
    },
    loseContinuation: () => {
      loseContinuation = true;
    },
    release: () => {
      suspended = false;
    },
    suspend: () => {
      suspended = true;
    },
  };
}
