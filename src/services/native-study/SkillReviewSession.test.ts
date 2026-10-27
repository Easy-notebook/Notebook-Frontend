import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SkillReviewSession } from './SkillReviewSession';
import {
  SkillReviewExecutionClient,
  decision,
  type ReviewInput,
} from './SkillReviewExecutionClient';
const draft = {
  workspace: 'w',
  revision: 1,
  csv: 'area\n40\n',
  lock: { version: 1 as const, skills: [{}] },
  selection: {
    source: 'github',
    location: 'fixture',
    content_hash: 'hash',
    model_path: 'houses.aalkm',
    reference: null,
  },
};
const memory = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    map,
  };
};
function fixture() {
  let loseDecision = false;
  let loseExecute = false;
  let executions = 0;
  const saved = new Map<string, string>();
  const calls: { route: string; body: Record<string, unknown> & { input?: ReviewInput } }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const route = url.split('/').pop()!;
    const body = JSON.parse(init.body as string);
    const input = route === 'decision' ? body.input : body;
    calls.push({ route, body });
    let status = saved.get(input.invocation) ?? 'pending';
    if (route === 'decision') {
      status = body.approve ? 'approved' : 'denied';
      saved.set(input.invocation, status);
      if (loseDecision) {
        loseDecision = false;
        throw new Error('lost decision response');
      }
    }
    const approval = {
      id: 'entry',
      scope: 'scope',
      action: {
        kind: 'agent',
        request: {
          caller: 'Reviewer',
          callee: 'Reviewer',
          ability: 'run',
          invocation: input.invocation,
          call_id: 'housing-review-root',
          arguments: { csv: { kind: 'String', value: input.csv } },
        },
      },
      state:
        status === 'pending'
          ? { status }
          : {
              status,
              actor: decision(status === 'approved').actor,
              reason: decision(status === 'approved').reason,
            },
    };
    let payload: unknown;
    if (route === 'request')
      payload = {
        approval,
        preview: { artifact_fingerprint: 'artifact', selection: input.selection, tools: [] },
      };
    else if (route === 'decision') payload = { approval };
    else {
      executions++;
      if (loseExecute) {
        loseExecute = false;
        throw new Error('lost execution response');
      }
      payload = { result: 'saved native review' };
    }
    return new Response(
      JSON.stringify({
        frontend_notebook_id: 'n',
        workspace: input.workspace,
        revision: input.revision,
        invocation: input.invocation,
        payload,
      })
    );
  });
  vi.stubGlobal('fetch', fetch);
  return {
    calls,
    fetch,
    loseDecision: () => {
      loseDecision = true;
    },
    loseExecute: () => {
      loseExecute = true;
    },
    executions: () => executions,
  };
}
beforeEach(() => vi.stubGlobal('crypto', { randomUUID: () => 'frozen-invocation' }));
afterEach(() => vi.unstubAllGlobals());
it('persists frozen input, separates approval/execution and recovers both lost responses across reloads', async () => {
  const http = fixture();
  const store = memory();
  let session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', store);
  const changing = structuredClone(draft);
  await session.prepare(changing);
  changing.csv = 'changed';
  expect(http.calls.map((c) => c.route)).toEqual(['request']);
  expect(session.getSnapshot().record?.input.csv).toBe(draft.csv);
  await session.execute();
  expect(http.executions()).toBe(0);
  http.loseDecision();
  await session.decide(true);
  expect(session.getSnapshot().record?.phase).toBe('decision');
  session.dispose();
  session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', store);
  await session.resume();
  expect(session.getSnapshot().record?.approval?.state.status).toBe('approved');
  expect(http.executions()).toBe(0);
  http.loseExecute();
  await session.execute();
  expect(session.getSnapshot().record?.phase).toBe('execute');
  session.clearCompleted();
  expect(session.getSnapshot().record).not.toBeNull();
  session.dispose();
  session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', store);
  await session.resume();
  expect(session.getSnapshot().record?.result).toBe('saved native review');
  const executeCalls = http.calls.filter((c) => c.route === 'execute');
  expect(executeCalls[0].body).toEqual(executeCalls[1].body);
  const decisions = http.calls.filter((c) => c.route === 'decision');
  expect(decisions[0].body).toEqual(decisions[1].body);
  expect(http.calls.every((c) => (c.body.input ?? c.body).invocation === 'frozen-invocation')).toBe(
    true
  );
  session.dispose();
  session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', store);
  await session.resume();
  expect(http.executions()).toBe(2); // Two HTTP attempts, not a claim of two server executions.
  session.clearCompleted();
  expect(store.map.size).toBe(0);
});
it('does not dispatch when pre-dispatch persistence fails and isolates workspaces', async () => {
  const http = fixture();
  const store = memory();
  const failure = {
    ...store,
    setItem: () => {
      throw new Error('quota');
    },
  };
  const session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', failure);
  await session.prepare(draft);
  expect(http.fetch).not.toHaveBeenCalled();
  expect(session.getSnapshot().error).toContain('quota');
  const current = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', store);
  await current.prepare(draft);
  const other = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'other', store);
  expect(other.getSnapshot().record).toBeNull();
});
it('keeps denial terminal and blocks corrupt stored state without erasing it', async () => {
  const http = fixture();
  const store = memory();
  const session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', store);
  await session.prepare(draft);
  await session.decide(false);
  await session.execute();
  await session.decide(true);
  expect(http.calls.map((c) => c.route)).toEqual(['request', 'decision']);
  const key = [...store.map.keys()][0];
  store.map.set(key, 'broken');
  const corrupt = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', store);
  expect(corrupt.getSnapshot().blocked).toBe(true);
  await corrupt.prepare(draft);
  expect(store.map.get(key)).toBe('broken');
});

it('retains the original execute step if saving its completed response fails', async () => {
  const http = fixture();
  const store = memory();
  let fail = true;
  const limited = {
    ...store,
    setItem: (key: string, value: string) => {
      if (JSON.parse(value).phase === 'completed' && fail) {
        fail = false;
        throw new Error('completion quota');
      }
      store.setItem(key, value);
    },
  };
  let session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', limited);
  await session.prepare(draft);
  await session.decide(true);
  await session.execute();
  expect(session.getSnapshot().record?.phase).toBe('execute');
  expect(session.getSnapshot().error).toContain('completion quota');
  session.dispose();
  session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', limited);
  await session.resume();
  expect(session.getSnapshot().record?.phase).toBe('completed');
  const attempts = http.calls.filter((c) => c.route === 'execute');
  expect(attempts).toHaveLength(2);
  expect(attempts[0].body).toEqual(attempts[1].body);
});

it.each(['workspace', 'csv', 'decision_scope'])(
  'rejects a mismatched %s without advancing to execution',
  async (fault) => {
    const http = fixture();
    const store = memory();
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const response = await http.fetch(url, init);
      const value = await response.json();
      if (fault === 'workspace') value.workspace = 'other';
      if (fault === 'csv') value.payload.approval.action.request.arguments.csv.value = 'changed';
      if (fault === 'decision_scope' && url.endsWith('/decision'))
        value.payload.approval.scope = 'changed';
      return new Response(JSON.stringify(value));
    });
    const session = new SkillReviewSession(new SkillReviewExecutionClient('n'), 'w', store);
    await session.prepare(draft);
    if (fault === 'decision_scope') await session.decide(true);
    expect(session.getSnapshot().error).not.toBeNull();
    expect(session.getSnapshot().record?.phase).toBe(
      fault === 'decision_scope' ? 'decision' : 'request'
    );
    await session.execute();
    expect(http.executions()).toBe(0);
  }
);
