import { afterEach, expect, it, vi } from 'vitest';
import { WorkflowDesignClient } from './WorkflowDesignClient';
import { WorkflowDesignSession } from './WorkflowDesignSession';
import { hash, input, memoryStorage, workflowFixture } from './test-support/workflowFixture';
afterEach(() => vi.unstubAllGlobals());
const session = (storage = memoryStorage(), revision = 1) =>
  new WorkflowDesignSession(new WorkflowDesignClient('houses'), 'w', revision, storage);
it('retains exact draft and execution operations across response loss and reload', async () => {
  const fixture = workflowFixture();
  const storage = memoryStorage();
  let current = session(storage);
  fixture.loseDraft();
  await current.prepare(input);
  expect(current.getSnapshot().record?.phase).toBe('drafting');
  current.clear();
  expect(current.getSnapshot().record).not.toBeNull();
  current.dispose();
  current = session(storage);
  expect(fixture.calls).toHaveLength(1);
  await current.resume();
  expect(fixture.calls[1].body).toEqual(fixture.calls[0].body);
  expect(current.getSnapshot().record?.phase).toBe('review');
  await current.execute('wrong');
  expect(fixture.calls).toHaveLength(2);
  fixture.loseExecution();
  await current.execute(hash);
  expect(current.getSnapshot().record?.phase).toBe('executing');
  current.clear();
  expect(current.getSnapshot().record).not.toBeNull();
  current.dispose();
  current = session(storage);
  await current.resume();
  expect(fixture.calls[3].body).toEqual(fixture.calls[2].body);
  expect(current.getSnapshot().record?.phase).toBe('completed');
  await current.resume();
  expect(fixture.calls).toHaveLength(4);
  current.dispose();
  current = session(storage);
  expect(current.getSnapshot().record?.result?.result.execution.status).toBe('completed');
  current.clear();
  expect(current.getSnapshot().record).toBeNull();
});
it('blocks dispatch when persistence fails, including saving execution intent', async () => {
  const fixture = workflowFixture();
  const storage = memoryStorage();
  const current = session(storage);
  const save = storage.setItem;
  storage.setItem = () => {
    throw new Error('quota');
  };
  await current.prepare(input);
  expect(fixture.calls).toHaveLength(0);
  storage.setItem = save;
  await current.prepare(input);
  storage.setItem = () => {
    throw new Error('quota');
  };
  await current.execute(hash);
  expect(fixture.calls).toHaveLength(1);
  expect(current.getSnapshot().record?.phase).toBe('review');
});
it('keeps pending intent when saving a received result fails', async () => {
  const fixture = workflowFixture();
  const storage = memoryStorage();
  const save = storage.setItem;
  let writes = 0;
  storage.setItem = (key, value) => {
    if (++writes === 2) throw new Error('quota');
    save(key, value);
  };
  const current = session(storage);
  await current.prepare(input);
  expect(current.getSnapshot().record?.phase).toBe('drafting');
  await current.resume();
  expect(fixture.calls[1].body).toEqual(fixture.calls[0].body);
  expect(current.getSnapshot().record?.phase).toBe('review');
});
it('binds restored state to scope, phase, reviewed artifact and frozen measurement', async () => {
  workflowFixture();
  const storage = memoryStorage();
  const current = session(storage);
  await current.prepare(input);
  await current.execute(hash);
  const [key, raw] = [...storage.map][0];
  for (const mutation of ['workspace', 'revision', 'fingerprint', 'input', 'phase']) {
    const record = JSON.parse(raw);
    if (mutation === 'workspace') record.input.workspace = 'other';
    else if (mutation === 'revision') record.input.expected_revision = 3;
    else if (mutation === 'fingerprint') record.execution.expected_fingerprint = 'b'.repeat(64);
    else if (mutation === 'input') record.execution.context.maximum = 999;
    else record.phase = 'review';
    storage.map.set(key, JSON.stringify(record));
    expect(session(storage).getSnapshot().blocked).toBe(true);
  }
  storage.map.set(key, raw);
  expect(session(storage, 2).getSnapshot().record).toBeNull();
  expect(storage.map.get(key)).toBe(raw);
});
it('keeps suspension distinct and does not retry or clear unresolved child work', async () => {
  const fixture = workflowFixture();
  fixture.suspend();
  const current = session();
  await current.prepare(input);
  await current.execute(hash);
  expect(current.getSnapshot().record?.phase).toBe('suspended');
  await current.resume();
  current.clear();
  expect(fixture.calls).toHaveLength(2);
  expect(current.getSnapshot().record?.phase).toBe('suspended');
});
it('freezes saved inputs and ignores responses after disposal', async () => {
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
  const storage = memoryStorage();
  const current = session(storage);
  const supplied = structuredClone(input);
  const pending = current.prepare(supplied);
  supplied.maximum = 999;
  expect(current.getSnapshot().record?.input.maximum).toBe(0.1);
  expect(Object.isFrozen(current.getSnapshot().record?.input.columns)).toBe(true);
  current.dispose();
  resolve({ ok: true, json: async () => ({}) });
  await pending;
  expect(session(storage).getSnapshot().record?.phase).toBe('drafting');
});
it('persists continuation intent and recovers the same attempt after response loss and reload', async () => {
  const fixture = workflowFixture();
  fixture.suspend();
  const storage = memoryStorage();
  let current = session(storage);
  await current.prepare(input);
  await current.execute(hash);
  const original = current.getSnapshot().record!.execution!;
  await current.continue();
  expect(current.getSnapshot().record?.phase).toBe('suspended');
  const firstAttempt = current.getSnapshot().record!.continuation!;
  fixture.release();
  fixture.loseContinuation();
  await current.continue();
  expect(current.getSnapshot().record?.phase).toBe('continuing');
  const pending = current.getSnapshot().record!.continuation!;
  expect(pending.execution_invocation).toBe(original.context.invocation);
  expect(pending.execution.context.invocation).not.toBe(firstAttempt.execution.context.invocation);
  expect(pending.execution.context.invocation).not.toBe(original.context.invocation);
  current.clear();
  current.dispose();
  current = session(storage);
  expect(current.getSnapshot().blocked).toBe(false);
  expect(fixture.calls).toHaveLength(4);
  await current.continue();
  expect(fixture.calls).toHaveLength(4);
  await current.resume();
  expect(fixture.calls[4].body).toEqual(fixture.calls[3].body);
  expect(current.getSnapshot().record?.phase).toBe('completed');
  expect(current.getSnapshot().record?.result?.result.execution.status).toBe('suspended');
  expect(current.getSnapshot().record?.continuationResult?.result.execution.status).toBe(
    'completed'
  );
  current.dispose();
  current = session(storage);
  expect(current.getSnapshot().record?.phase).toBe('completed');
  await current.continue();
  expect(fixture.calls).toHaveLength(5);
  current.clear();
  expect(current.getSnapshot().record).toBeNull();
});
it('does not dispatch an unpersisted continuation and rejects tampered restored continuation identity', async () => {
  const fixture = workflowFixture();
  fixture.suspend();
  const storage = memoryStorage();
  const current = session(storage);
  await current.prepare(input);
  await current.execute(hash);
  const save = storage.setItem;
  storage.setItem = () => {
    throw new Error('quota');
  };
  await current.continue();
  expect(fixture.calls).toHaveLength(2);
  expect(current.getSnapshot().record?.phase).toBe('suspended');
  storage.setItem = save;
  fixture.release();
  await current.continue();
  const [key, raw] = [...storage.map][0];
  for (const mutation of ['child', 'input', 'deployment', 'reference', 'attempt', 'phase']) {
    const record = JSON.parse(raw);
    if (mutation === 'child') record.continuation.execution_invocation = 'foreign';
    else if (mutation === 'input') record.continuation.execution.context.maximum = 999;
    else if (mutation === 'deployment') record.continuationResult.result.deployment = 'foreign';
    else if (mutation === 'reference') record.continuationResult.reference_id = 'foreign';
    else if (mutation === 'attempt') record.continuationResult.invocation = 'foreign';
    else record.phase = 'continuing';
    storage.map.set(key, JSON.stringify(record));
    expect(session(storage).getSnapshot().blocked).toBe(true);
  }
  expect(fixture.calls).toHaveLength(3);
});
it('retains a pending continuation when persisting its completed response fails', async () => {
  const fixture = workflowFixture();
  fixture.suspend();
  const storage = memoryStorage();
  const current = session(storage);
  await current.prepare(input);
  await current.execute(hash);
  fixture.release();
  const save = storage.setItem;
  let writes = 0;
  storage.setItem = (key, value) => {
    if (++writes === 2) throw new Error('quota');
    save(key, value);
  };
  await current.continue();
  expect(current.getSnapshot().record?.phase).toBe('continuing');
  await current.resume();
  expect(fixture.calls[3].body).toEqual(fixture.calls[2].body);
  expect(current.getSnapshot().record?.phase).toBe('completed');
});
