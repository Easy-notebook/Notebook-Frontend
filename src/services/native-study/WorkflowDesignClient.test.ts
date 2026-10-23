import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowDesignClient, type WorkflowDraftInput } from './WorkflowDesignClient';
const hash = 'a'.repeat(64);
const context = {
  workspace: 'native-houses',
  expected_revision: 2,
  invocation: 'draft-1',
  reference_csv: 'area,rooms\n40,2\n80,4\n',
  query_csv: 'area,rooms\n41,2\n',
  columns: ['area', 'rooms'],
  clusters: 2,
  neighbors: 2,
  maximum: 0.1,
};
const input: WorkflowDraftInput = {
  ...context,
  goal: 'Select nearby measured houses',
  name: 'HousingWorkflow',
};
const identity = {
  frontend_notebook_id: 'houses',
  workspace: context.workspace,
  revision: 2,
  invocation: context.invocation,
  reference_id: 'reference-id',
  query_data_id: 'query-id',
};
const draft = {
  ...identity,
  execution_authorized: false,
  draft: {
    draft: 'draft:one',
    source: 'agent HousingWorkflow is Agent',
    checked: { valid: true, fingerprint: hash },
    inspection: {
      name: input.name,
      owned: true,
      public: { address: input.name, abilities: ['analyze'] },
      state: null,
      revision: 1,
    },
  },
};
const executionInput = { context, draft: 'draft:one', expected_fingerprint: hash };
const completed = {
  ...identity,
  result: {
    deployment: 'deployment:one',
    fingerprint: hash,
    execution: { status: 'completed', value: { selected_count: 1 } },
  },
};
const signal = () => new AbortController().signal;
function response(value: unknown) {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => value });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

it('drafts through the scoped transport and preserves source and native inspection', async () => {
  const fetch = response(draft);
  const abort = signal();
  expect(await new WorkflowDesignClient('houses').draft(input, abort)).toEqual(draft);
  expect(fetch.mock.calls[0][0]).toBe('/aal-api/workspaces/houses/workflow/draft');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input);
  expect(fetch.mock.calls[0][1].signal).toBe(abort);
});
it('executes only the exact reviewed fingerprint and retains the completion envelope', async () => {
  const fetch = response(completed);
  expect(await new WorkflowDesignClient('houses').execute(executionInput, signal())).toEqual(
    completed
  );
  expect(fetch.mock.calls[0][0]).toBe('/aal-api/workspaces/houses/workflow/execute');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(executionInput);
});
it('preserves suspension without promoting it to completion', async () => {
  const suspended = {
    ...completed,
    result: {
      ...completed.result,
      execution: {
        status: 'suspended',
        workflow: 'review',
        state: 'await_review',
        invocation: 'native-child-hash',
      },
    },
  };
  response(suspended);
  const result = await new WorkflowDesignClient('houses').execute(executionInput, signal());
  expect(result.result.execution.status).toBe('suspended');
  expect(result.result.execution).not.toHaveProperty('value');
});
describe('rejects responses from another request', () => {
  it.each(['frontend_notebook_id', 'workspace', 'revision', 'invocation'])('%s', async (key) => {
    response({ ...draft, [key]: key === 'revision' ? 3 : 'other' });
    await expect(new WorkflowDesignClient('houses').draft(input, signal())).rejects.toThrow();
    response({ ...completed, [key]: key === 'revision' ? 3 : 'other' });
    await expect(
      new WorkflowDesignClient('houses').execute(executionInput, signal())
    ).rejects.toThrow();
  });
});
it('rejects a deployed or foreign draft inspection and invented authorization', async () => {
  for (const mutation of [
    { ...draft, execution_authorized: true },
    {
      ...draft,
      draft: { ...draft.draft, inspection: { ...draft.draft.inspection, state: 'active' } },
    },
    {
      ...draft,
      draft: { ...draft.draft, inspection: { ...draft.draft.inspection, name: 'Other' } },
    },
  ]) {
    response(mutation);
    await expect(new WorkflowDesignClient('houses').draft(input, signal())).rejects.toThrow();
  }
});
it('rejects changed fingerprints and malformed execution envelopes', async () => {
  for (const result of [
    { ...completed.result, fingerprint: 'b'.repeat(64) },
    { ...completed.result, execution: { status: 'completed' } },
    { ...completed.result, execution: { status: 'suspended', value: 1 } },
    { ...completed.result, execution: { status: 'success', value: 1 } },
  ]) {
    response({ ...completed, result });
    await expect(
      new WorkflowDesignClient('houses').execute(executionInput, signal())
    ).rejects.toThrow();
  }
  response({
    ...completed,
    result: { ...completed.result, execution: { status: 'completed', value: null } },
  });
  expect(
    (await new WorkflowDesignClient('houses').execute(executionInput, signal())).result.execution
  ).toEqual({ status: 'completed', value: null });
});
it('rejects invalid input before dispatch', async () => {
  const fetch = response(draft);
  for (const invalid of [
    { ...input, goal: '房'.repeat(2731) },
    { ...input, name: 'bad-name' },
    { ...input, maximum: -1 },
    { ...input, neighbors: 9 },
    { ...input, invocation: ' ' },
  ])
    await expect(new WorkflowDesignClient('houses').draft(invalid, signal())).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('freezes the request before awaiting and refuses a late aborted response', async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    )
  );
  const mutable = structuredClone(input);
  const client = new WorkflowDesignClient('houses');
  const pending = client.draft(mutable, signal());
  mutable.workspace = 'other';
  mutable.columns[0] = 'price';
  resolve({ ok: true, json: async () => draft });
  expect(await pending).toEqual(draft);
  const abort = new AbortController();
  const cancelled = client.draft(input, abort.signal);
  abort.abort();
  resolve({ ok: true, json: async () => draft });
  await expect(cancelled).rejects.toThrow();
});
it('rejects oversized serialized bodies and already-cancelled requests without transport', async () => {
  const fetch = response(draft);
  const client = new WorkflowDesignClient('houses');
  await expect(
    client.draft(
      {
        ...input,
        reference_csv: 'x'.repeat(3 * 1024 * 1024),
        query_csv: 'x'.repeat(3 * 1024 * 1024),
      },
      signal()
    )
  ).rejects.toThrow('5 MiB');
  const abort = new AbortController();
  abort.abort();
  await expect(client.draft(input, abort.signal)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
