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
  let loseDraft = false;
  let loseExecution = false;
  let suspended = false;
  let loseContinuation = false;
  const calls: { route: string; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const route = url.split('/').pop()!;
    const body = JSON.parse(init.body as string);
    calls.push({ route, body });
    const execution = route === 'resume' ? body.execution : body;
    const context = route === 'draft' ? body : execution.context;
    const identity = {
      frontend_notebook_id: 'houses',
      workspace: context.workspace,
      revision: context.expected_revision,
      invocation: context.invocation,
      reference_id: 'reference-id',
      query_data_id: 'query-id',
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
