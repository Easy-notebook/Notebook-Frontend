import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NativeStudyClient } from './NativeStudyClient';
import { NativeStudySession } from './NativeStudySession';
import { nativeView } from './contracts';
import { studyMarkdown } from './studyExport';

const view = (id = 'a', revision = 0) => ({
  frontend_notebook_id: id,
  document: { id: `native-${id}`, revision, notebook: { status: 'Open' } },
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
beforeEach(() => sessionStorage.clear());
describe('native study transport and lifecycle', () => {
  it('rejects wrong notebook responses and malformed numerical evidence', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(view('other')));
    await expect(new NativeStudyClient('a', request).state()).rejects.toThrow('identity mismatch');
    expect(() => new NativeStudyClient('bad\0id', request)).toThrow('Invalid notebook');
    expect(() =>
      nativeView.parse({
        ...view(),
        document: { id: 'x', revision: -1, notebook: { status: 'Open' } },
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
    const posts = request.mock.calls.filter(([, options]) => options?.method === 'POST');
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
