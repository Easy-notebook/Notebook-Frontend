import { describe, expect, it } from 'vitest';
import type { NotebookSnapshot } from './types';
import { NotebookSaveQueue } from './NotebookSaveQueue';

const snapshot = (notebookId = 'a') => ({
  notebookId,
  notebookTitle: 'Title',
  cells: [],
  tasks: [],
  timestamp: 0,
});
describe('notebook save transitions', () => {
  it('preserves an in-flight revision when a newer snapshot replaces pending content', async () => {
    const queue = new NotebookSaveQueue();
    const first = queue.enqueue(snapshot());
    queue.begin(first);
    const olderState = queue.progress('a');
    const next = queue.enqueue(snapshot());
    const barrier = queue.createBarrier('a', first.revision).completion;
    queue.acknowledge(first);
    await barrier;
    expect(queue.progress('a')).toMatchObject({
      phase: 'scheduled',
      currentRevision: next.revision,
      committedRevision: first.revision,
    });
    expect(olderState).toMatchObject({ phase: 'writing', currentRevision: first.revision });
    expect(queue.get('a')).toBe(next);
  });
  it('allows a coalesced newer commit to satisfy an older revision barrier', async () => {
    const queue = new NotebookSaveQueue();
    const first = queue.enqueue(snapshot());
    const barrier = queue.createBarrier('a', first.revision).completion;
    const next = queue.enqueue(snapshot());
    queue.begin(next);
    queue.acknowledge(next);
    await barrier;
    expect(queue.progress('a')?.phase).toBe('clean');
    expect(queue.size).toBe(0);
  });
  it('retains a failed snapshot, rejects barriers only after exhaustion, and supports retry', async () => {
    const queue = new NotebookSaveQueue();
    const entry = queue.enqueue(snapshot());
    const rejected = expect(queue.createBarrier('a', entry.revision).completion).rejects.toThrow(
      'quota'
    );
    queue.begin(entry);
    queue.fail(entry, new Error('temporary'), false);
    expect(queue.progress('a')?.phase).toBe('retry_wait');
    queue.begin(entry);
    queue.fail(entry, new Error('quota'), true);
    await rejected;
    expect(queue.get('a')).toBe(entry);
    const retried = queue.createBarrier('a', entry.revision).completion;
    queue.begin(entry);
    queue.acknowledge(entry);
    await retried;
  });
  it('does not reject a barrier for a superseded failed revision', async () => {
    const queue = new NotebookSaveQueue();
    const first = queue.enqueue(snapshot());
    const barrier = queue.createBarrier('a', first.revision).completion;
    queue.begin(first);
    const next = queue.enqueue(snapshot());
    queue.fail(first, new Error('old failed'), true);
    expect(queue.progress('a')?.phase).toBe('scheduled');
    queue.begin(next);
    queue.acknowledge(next);
    await barrier;
  });
  it('rejects stale completions and prevents discarding in-flight writes', () => {
    const queue = new NotebookSaveQueue();
    const entry = queue.enqueue(snapshot());
    expect(() => queue.acknowledge(entry)).toThrow('Stale');
    queue.begin(entry);
    expect(() => queue.begin(entry)).toThrow('concurrent');
    expect(() => queue.discard('a')).toThrow('in-flight');
  });
  it('rejects waiting callers when pending data is explicitly discarded', async () => {
    const queue = new NotebookSaveQueue();
    const entry = queue.enqueue(snapshot());
    const discarded = expect(queue.createBarrier('a', entry.revision).completion).rejects.toThrow(
      'discarded'
    );
    queue.discard('a');
    await discarded;
    expect(queue.size).toBe(0);
  });
});

it('detaches nested data when a revision is accepted', () => {
  const queue = new NotebookSaveQueue();
  const input: NotebookSnapshot = {
    ...snapshot(),
    cells: [
      {
        id: 'cell',
        type: 'code',
        content: 'before',
        outputs: [{ type: 'text', content: 'original' }],
        metadata: { label: 'accepted' },
      },
    ],
  };
  const accepted = queue.enqueue(input);
  input.cells[0].content = 'after';
  input.cells[0].outputs![0].content = 'changed';
  input.cells[0].metadata!.label = 'changed';
  input.cells.push({ id: 'late', type: 'markdown', content: 'late' });
  expect(accepted.cells).toEqual([
    {
      id: 'cell',
      type: 'code',
      content: 'before',
      outputs: [{ type: 'text', content: 'original' }],
      metadata: { label: 'accepted' },
    },
  ]);
});
it('leaves the accepted revision and its barrier intact if cloning fails', async () => {
  const queue = new NotebookSaveQueue();
  const previous = queue.enqueue(snapshot());
  const progress = queue.progress('a');
  const barrier = queue.createBarrier('a', previous.revision).completion;
  const invalid: NotebookSnapshot = {
    ...snapshot(),
    cells: [{ id: 'cell', type: 'code', content: '', metadata: { callback: () => {} } }],
  };
  expect(() => queue.enqueue(invalid)).toThrow();
  expect(queue.get('a')).toBe(previous);
  expect(queue.progress('a')).toBe(progress);
  queue.begin(previous);
  queue.acknowledge(previous);
  await barrier;
  expect(queue.enqueue(snapshot()).revision).toBe(previous.revision + 1);
});
