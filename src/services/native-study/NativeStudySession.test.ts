import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeStudyClient } from './NativeStudyClient';
import { NativeStudySession } from './NativeStudySession';
import { nativeView } from './contracts';
import { studyMarkdown } from './studyExport';

const view = (id = 'a', revision = 0) => ({
  frontend_notebook_id: id,
  document: {
    id: `native-${id}`,
    revision,
    notebook: { status: 'Open', chapters: [] },
    messages: [],
  },
  recipients: [{ id: 'data_mining', label: '房屋特征分群', aliases: ['mining'] }],
  model_enabled: false,
  study: {
    input: null,
    current: false,
    result: null,
    comparison: null,
    practice: null,
    sample_evidence: null,
  },
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const lookupResponse = (input: RequestInfo | URL, options?: RequestInit) => {
  if (!String(input).endsWith('/commands/lookup')) return null;
  const command = JSON.parse(String(options?.body));
  return response({
    frontend_notebook_id: 'a',
    workspace: command.workspace,
    invocation: command.invocation,
    ability: command.ability,
    status: 'unconfirmed',
    result: null,
  });
};
beforeEach(() => sessionStorage.clear());
describe('native study transport and lifecycle', () => {
  it('rejects wrong notebook responses and malformed numerical evidence', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(view('other')));
    await expect(new NativeStudyClient('a', request).state()).rejects.toThrow('identity mismatch');
    expect(() => new NativeStudyClient('bad\0id', request)).toThrow('Invalid notebook');
    expect(() =>
      nativeView.parse({
        ...view(),
        document: {
          id: 'x',
          revision: -1,
          notebook: { status: 'Open', chapters: [] },
          messages: [],
        },
      })
    ).toThrow();
  });
  it('encodes imported notebook names as opaque route keys', async () => {
    const id = '房屋 / a.ipynb';
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(view(id)));
    await new NativeStudyClient(id, request).state();
    expect(request.mock.calls[0][0]).toBe(`/aal-api/workspaces/${encodeURIComponent(id)}/state`);
  });
  it('keeps the frozen request across interruption, disposal and reopening', async () => {
    const calls: string[] = [];
    let fail = true;
    const request = vi.fn<typeof fetch>(async (_input, options) => {
      const found = lookupResponse(_input, options);
      if (found) return found;
      if (options?.method === 'POST') {
        calls.push(String(options.body));
        if (fail) throw new Error('Disconnected');
        return response({});
      }
      return response(view('a', fail ? 0 : 1));
    });
    const first = new NativeStudySession(new NativeStudyClient('a', request));
    await first.refresh();
    const parameters = { columns: ['area'], clusters: 2 };
    await first.execute('configure_study', { parameters });
    parameters.columns[0] = 'mutated';
    expect(first.getSnapshot().status).toBe('recoverable');
    first.dispose();
    fail = false;
    const reopened = new NativeStudySession(new NativeStudyClient('a', request));
    await reopened.refresh();
    await reopened.retry();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(calls[0]);
    expect(JSON.parse(calls[1]).arguments.parameters.columns).toEqual(['area']);
    expect(reopened.getSnapshot().view?.document.revision).toBe(1);
    expect(reopened.getSnapshot().pending).toBe(false);
  });
  it('does not dispatch when retry persistence fails', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(view()));
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota');
      },
      removeItem: vi.fn(),
    };
    const session = new NativeStudySession(new NativeStudyClient('a', request), storage);
    await session.refresh();
    await session.execute('run_study', {});
    expect(request).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().error).toBe('Quota');
  });
  it('does not let disposed work erase a newly reopened retry', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const request = vi.fn<typeof fetch>(async (_input, options) => {
      const found = lookupResponse(_input, options);
      if (found) return found;
      if (options?.method === 'POST') {
        await pending;
        return response({});
      }
      return response(view());
    });
    const session = new NativeStudySession(new NativeStudyClient('a', request));
    await session.refresh();
    const running = session.execute('run_study', {});
    session.dispose();
    const stored = sessionStorage.getItem('aal-study-pending:a');
    resolve();
    await running;
    expect(sessionStorage.getItem('aal-study-pending:a')).toBe(stored);
  });
  it('cannot submit concurrent mutations or overwrite another notebook retry', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const request = vi.fn<typeof fetch>(async (_input, options) => {
      const found = lookupResponse(_input, options);
      if (found) return found;
      if (options?.method === 'POST') await pending;
      return response(view());
    });
    const a = new NativeStudySession(new NativeStudyClient('a', request));
    await a.refresh();
    const running = a.execute('run_study', {});
    await a.execute('compare_study', {});
    expect(request).toHaveBeenCalledTimes(2);
    const b = new NativeStudySession(new NativeStudyClient('b', request));
    expect(b.getSnapshot().pending).toBe(false);
    resolve();
    await running;
  });
  it('keeps a command retryable when the post succeeds but refreshing fails', async () => {
    let gets = 0;
    const request = vi.fn<typeof fetch>(async (_input, options) => {
      const found = lookupResponse(_input, options);
      if (found) return found;
      if (options?.method === 'POST') return response({});
      if (++gets === 2) throw new Error('read interrupted');
      return response(view());
    });
    const session = new NativeStudySession(new NativeStudyClient('a', request));
    await session.refresh();
    await session.execute('run_study', {});
    expect(session.getSnapshot().pending).toBe(true);
    await session.retry();
    expect(session.getSnapshot().status).toBe('ready');
    const posts = request.mock.calls.filter(([input]) => String(input).endsWith('/command'));
    expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
  });
  it('does not export absent or stale study evidence', () => {
    expect(() => studyMarkdown(nativeView.parse(view()))).toThrow('请先执行');
  });
});

it('reopens and retries the whole PCS task with its original query and caller threshold', async () => {
  const sent: string[] = [];
  let fail = true;
  const request = vi.fn<typeof fetch>(async (_input, options) => {
    const found = lookupResponse(_input, options);
    if (found) return found;
    if (options?.method === 'POST') {
      sent.push(String(options.body));
      if (fail) throw new Error('source provider interrupted');
      return response({});
    }
    return response(view('a', fail ? 0 : 6));
  });
  const first = new NativeStudySession(new NativeStudyClient('a', request));
  await first.refresh();
  const input = {
    goal: 'Compare and retain evidence',
    csv: 'area,rooms\n40,2',
    query_csv: 'area,rooms\n41,2',
    neighbors: 3,
    maximum: 0.001,
  };
  await first.execute('auto_study_task', input);
  input.query_csv = 'changed';
  input.maximum = 1000;
  first.dispose();
  fail = false;
  const reopened = new NativeStudySession(new NativeStudyClient('a', request));
  await reopened.refresh();
  await reopened.retry();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
  expect(JSON.parse(sent[1]).arguments.maximum).toBe(0.001);
  expect(JSON.parse(sent[1]).arguments.query_csv).toBe('area,rooms\n41,2');
  expect(reopened.getSnapshot().view?.document.revision).toBe(6);
  expect(reopened.getSnapshot().pending).toBe(false);
  reopened.dispose();
});

it('rejects malformed collaborator history and duplicate catalog identities before publication', () => {
  const base = view();
  expect(() =>
    nativeView.parse({ ...base, recipients: [...base.recipients, ...base.recipients] })
  ).toThrow();
  expect(() =>
    nativeView.parse({
      ...base,
      document: {
        ...base.document,
        messages: [
          { target_agent: 'data_mining', message: 'Question', reply: { text: 'not a string' } },
        ],
      },
    })
  ).toThrow();
  expect(() =>
    nativeView.parse({
      ...base,
      document: {
        ...base.document,
        messages: [{ target_agent: 'data_mining', message: 'Question', reply: '房'.repeat(2731) }],
      },
    })
  ).toThrow();
});

it('exports historical model discussion separately from measurements without executable fences', () => {
  const base = view();
  const record = nativeView.parse({
    ...base,
    document: {
      ...base.document,
      messages: [
        {
          target_agent: 'data_mining',
          message: 'Why similar?',
          reply: '```html\n<script>text</script>\n```',
        },
      ],
    },
    study: {
      ...base.study,
      current: true,
      result: {
        kind: 'mining',
        report: {
          reference_id: 'reference',
          inertia: 1,
          mean_silhouette: 0.8,
          clusters: [],
          model: { features: [] },
        },
      },
    },
  });
  const exported = studyMarkdown(record);
  expect(exported).toContain('### 协作者讨论（模型生成）');
  expect(exported).toContain('不是测量结论');
  expect(exported).not.toContain('```html');
  const blocks = [...exported.matchAll(/```json\n([\s\S]*?)\n```/g)];
  expect(blocks).toHaveLength(2);
  expect(JSON.parse(blocks[0][1])).not.toHaveProperty('messages');
  expect(JSON.parse(blocks[1][1])).toEqual(record.document.messages);
});

it('observes a lost response without resending or treating observed success as durable result delivery', async () => {
  vi.useFakeTimers();
  let command: Record<string, unknown> | undefined;
  let posts = 0;
  const request = vi.fn<typeof fetch>(async (url, options) => {
    if (options?.method === 'POST') {
      posts++;
      command = JSON.parse(String(options.body));
      throw new Error('response lost while server continues');
    }
    if (String(url).includes('/operations/'))
      return response({
        frontend_notebook_id: 'a',
        invocation: command?.invocation,
        observation: {
          attempt: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          workspace: 'native-a',
          ability: 'run_study',
          phase: 'succeeded',
          completed_calls: 5,
          failed_calls: 0,
          active: { model: 0, skill: 0, other: 0 },
        },
      });
    return response(view());
  });
  const session = new NativeStudySession(new NativeStudyClient('a', request));
  try {
    await session.refresh();
    await session.execute('run_study', {});
    await vi.advanceTimersByTimeAsync(500);
    expect(session.getSnapshot().progress?.status).toBe('observed');
    expect(session.getSnapshot().status).toBe('recoverable');
    expect(session.getSnapshot().pending).toBe(true);
    expect(sessionStorage.getItem('aal-study-pending:a')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(10000);
    expect(posts).toBe(1);
  } finally {
    session.dispose();
    vi.useRealTimers();
  }
});

const savedCommand = {
  workspace: 'native-a',
  ability: 'run_study',
  arguments: { expected_revision: 0 },
  invocation: 'saved-command',
};
const retainedReply = () => ({
  frontend_notebook_id: 'a',
  workspace: 'native-a',
  ability: 'run_study',
  invocation: 'saved-command',
  status: 'completed',
  result: { id: 'native-a', revision: 1 },
});

it('recovers a retained command after reopening without dispatch and refreshes the current revision', async () => {
  sessionStorage.setItem('aal-study-pending:a', JSON.stringify(savedCommand));
  const request = vi.fn<typeof fetch>(async (input, options) => {
    if (String(input).endsWith('/commands/lookup')) {
      expect(JSON.parse(String(options?.body))).toEqual(savedCommand);
      return response(retainedReply());
    }
    if (String(input).endsWith('/command')) throw new Error('execution endpoint is blocked');
    return response(view('a', 8));
  });
  const session = new NativeStudySession(new NativeStudyClient('a', request));
  await session.refresh();
  await session.retry();
  expect(session.getSnapshot().status).toBe('ready');
  expect(session.getSnapshot().view?.document.revision).toBe(8);
  expect(sessionStorage.getItem('aal-study-pending:a')).toBeNull();
  expect(request.mock.calls.filter(([input]) => String(input).endsWith('/command'))).toHaveLength(
    0
  );
  session.dispose();
});

it.each([
  { frontend_notebook_id: 'other' },
  { workspace: 'other' },
  { invocation: 'other' },
  { ability: 'compare_study' },
  { result: { id: 'other', revision: 1 } },
  { result: null },
  { status: 'unconfirmed' },
])('keeps the frozen retry after invalid completion evidence: %j', async (changed) => {
  sessionStorage.setItem('aal-study-pending:a', JSON.stringify(savedCommand));
  const request = vi.fn<typeof fetch>(async (input) =>
    String(input).endsWith('/commands/lookup')
      ? response({ ...retainedReply(), ...changed })
      : response(view())
  );
  const session = new NativeStudySession(new NativeStudyClient('a', request));
  await session.retry();
  expect(session.getSnapshot().status).toBe('recoverable');
  expect(session.getSnapshot().pending).toBe(true);
  expect(request.mock.calls.filter(([input]) => String(input).endsWith('/command'))).toHaveLength(
    0
  );
  expect(JSON.parse(sessionStorage.getItem('aal-study-pending:a')!)).toEqual(savedCommand);
  session.dispose();
});

it('does not fall back to execution after a failed lookup', async () => {
  sessionStorage.setItem('aal-study-pending:a', JSON.stringify(savedCommand));
  const request = vi.fn<typeof fetch>(async (input) => {
    if (String(input).endsWith('/commands/lookup')) throw new Error('lookup unavailable');
    return response(view());
  });
  const session = new NativeStudySession(new NativeStudyClient('a', request));
  await session.retry();
  expect(session.getSnapshot().error).toBe('lookup unavailable');
  expect(session.getSnapshot().pending).toBe(true);
  expect(request.mock.calls.filter(([input]) => String(input).endsWith('/command'))).toHaveLength(
    0
  );
  session.dispose();
});

it('does not dispatch an unconfirmed retry if disposed during lookup', async () => {
  sessionStorage.setItem('aal-study-pending:a', JSON.stringify(savedCommand));
  let resolve!: (response: Response) => void;
  const waiting = new Promise<Response>((done) => {
    resolve = done;
  });
  const request = vi.fn<typeof fetch>(async (input) =>
    String(input).endsWith('/commands/lookup') ? waiting : response(view())
  );
  const session = new NativeStudySession(new NativeStudyClient('a', request));
  const retry = session.retry();
  session.dispose();
  resolve(response({ ...retainedReply(), status: 'unconfirmed', result: null }));
  await retry;
  expect(request.mock.calls.filter(([input]) => String(input).endsWith('/command'))).toHaveLength(
    0
  );
  expect(JSON.parse(sessionStorage.getItem('aal-study-pending:a')!)).toEqual(savedCommand);
});
