import { AttachmentUrlRegistry } from './AttachmentUrlRegistry';
import { expect, it, vi } from 'vitest';
import { AttachmentDraft } from './AttachmentDraft';
import type { UploadFile } from './types';
function attachment(id: string): UploadFile {
  return {
    id,
    name: `${id}.txt`,
    size: 1,
    type: 'text/plain',
    url: `blob:${id}`,
    file: new File(['a'], `${id}.txt`),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const add = (draft: AttachmentDraft, id: string) =>
  draft.upload([new File(['a'], 'a.txt')], async () => [attachment(id)], vi.fn());
it('releases removed and detached draft URLs exactly once', async () => {
  const revoke = vi.fn();
  const urls = new AttachmentUrlRegistry(revoke);
  const draft = new AttachmentDraft(urls);
  await add(draft, 'a');
  await add(draft, 'b');
  draft.remove('a');
  draft.remove('a');
  draft.detach();
  draft.detach();
  expect(revoke.mock.calls).toEqual([['blob:a'], ['blob:b']]);
});
it('discards a late upload after reset without disturbing a new upload', async () => {
  const revoke = vi.fn();
  const urls = new AttachmentUrlRegistry(revoke);
  const draft = new AttachmentDraft(urls);
  const old = deferred<UploadFile[]>();
  const next = deferred<UploadFile[]>();
  const first = draft.upload([new File([], 'a.txt')], () => old.promise, vi.fn());
  draft.reset();
  const second = draft.upload([new File([], 'b.txt')], () => next.promise, vi.fn());
  old.resolve([attachment('a')]);
  await first;
  expect(revoke).toHaveBeenCalledWith('blob:a');
  expect(draft.getSnapshot()).toEqual({ files: [], uploading: 1 });
  next.resolve([attachment('b')]);
  await second;
  expect(draft.getSnapshot().files.map((f) => f.id)).toEqual(['b']);
});
it('counts concurrent uploads and suppresses detached failures', async () => {
  const draft = new AttachmentDraft(new AttachmentUrlRegistry(vi.fn()));
  const old = deferred<UploadFile[]>();
  const error = vi.fn();
  const first = draft.upload([new File([], 'a.txt')], () => old.promise, error);
  await add(draft, 'b');
  expect(draft.getSnapshot().uploading).toBe(1);
  draft.detach();
  old.reject(new Error('late'));
  await first;
  expect(error).not.toHaveBeenCalled();
});
it('pins a submitting snapshot until disposition is known and preserves newly added files', async () => {
  const revoke = vi.fn();
  const urls = new AttachmentUrlRegistry(revoke);
  const draft = new AttachmentDraft(urls);
  await add(draft, 'a');
  const submission = draft.beginSubmission();
  await add(draft, 'b');
  draft.remove('a');
  expect(revoke).not.toHaveBeenCalled();
  const releaseRecord = urls.retainExisting('blob:a')!;
  submission.finish(true);
  submission.finish(true);
  expect(draft.getSnapshot().files.map((f) => f.id)).toEqual(['b']);
  draft.detach();
  expect(revoke.mock.calls).toEqual([['blob:b']]);
  releaseRecord();
  expect(revoke).toHaveBeenLastCalledWith('blob:a');
});
it('releases unconsumed attachments when a handled command creates no record', async () => {
  const revoke = vi.fn();
  const urls = new AttachmentUrlRegistry(revoke);
  const draft = new AttachmentDraft(urls);
  await add(draft, 'a');
  draft.beginSubmission().finish(true);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
  expect(draft.getSnapshot().files).toEqual([]);
});
it('retains failed submissions for retry and preserves attachments already committed before failure', async () => {
  const revoke = vi.fn();
  const urls = new AttachmentUrlRegistry(revoke);
  const draft = new AttachmentDraft(urls);
  await add(draft, 'a');
  const failed = draft.beginSubmission();
  failed.finish(false);
  expect(draft.getSnapshot().files).toHaveLength(1);
  expect(revoke).not.toHaveBeenCalled();
  const recorded = draft.beginSubmission();
  const releaseRecord = urls.retainExisting('blob:a')!;
  recorded.finish(false);
  draft.remove('a');
  expect(revoke).not.toHaveBeenCalled();
  releaseRecord();
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
it('defers unmounted pending resources until the last concurrent submission settles', async () => {
  const revoke = vi.fn();
  const urls = new AttachmentUrlRegistry(revoke);
  const draft = new AttachmentDraft(urls);
  await add(draft, 'a');
  const one = draft.beginSubmission();
  const two = draft.beginSubmission();
  draft.detach();
  one.finish(false);
  expect(revoke).not.toHaveBeenCalled();
  two.finish(false);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
it('does not publish an old submission completion after reset', async () => {
  const draft = new AttachmentDraft(new AttachmentUrlRegistry(vi.fn()));
  await add(draft, 'a');
  const submission = draft.beginSubmission();
  draft.reset();
  const notify = vi.fn();
  draft.subscribe(notify);
  submission.finish(true);
  expect(notify).not.toHaveBeenCalled();
});

it('replaces controlled batches and releases only attachments that leave the draft', () => {
  const revoke = vi.fn();
  const draft = new AttachmentDraft(new AttachmentUrlRegistry(revoke));
  const a = attachment('a');
  const b = attachment('b');
  draft.replaceFiles([a]);
  draft.replaceFiles([a, b]);
  expect(revoke).not.toHaveBeenCalled();
  draft.replaceFiles((previous) => previous.filter((file) => file.id !== 'a'));
  expect(revoke.mock.calls).toEqual([['blob:a']]);
  draft.replaceFiles([]);
  draft.detach();
  expect(revoke.mock.calls).toEqual([['blob:a'], ['blob:b']]);
});
it('acquires replacement leases before releasing an old ID sharing the same URL', () => {
  const revoke = vi.fn();
  const draft = new AttachmentDraft(new AttachmentUrlRegistry(revoke));
  draft.replaceFiles([attachment('a')]);
  draft.replaceFiles([{ ...attachment('b'), url: 'blob:a' }]);
  expect(revoke).not.toHaveBeenCalled();
  draft.detach();
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
});
it('preserves a replacement URL with the same ID when an older submission settles', () => {
  const revoke = vi.fn();
  const draft = new AttachmentDraft(new AttachmentUrlRegistry(revoke));
  draft.replaceFiles([attachment('a')]);
  const old = draft.beginSubmission();
  const replacement = { ...attachment('a'), url: 'blob:replacement' };
  draft.replaceFiles([replacement]);
  expect(revoke).not.toHaveBeenCalled();
  old.finish(true);
  expect(draft.getSnapshot().files).toEqual([replacement]);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
  draft.detach();
  expect(revoke).toHaveBeenLastCalledWith('blob:replacement');
});
it('keeps replaced pinned resources until all pending submissions settle', () => {
  const revoke = vi.fn();
  const draft = new AttachmentDraft(new AttachmentUrlRegistry(revoke));
  draft.replaceFiles([attachment('a')]);
  const first = draft.beginSubmission();
  const second = draft.beginSubmission();
  draft.replaceFiles([attachment('b')]);
  draft.detach();
  expect(revoke.mock.calls).toEqual([['blob:b']]);
  first.finish(false);
  expect(revoke).toHaveBeenCalledTimes(1);
  second.finish(false);
  expect(revoke).toHaveBeenLastCalledWith('blob:a');
});
it('releases incoming files after detach without publishing a new draft', () => {
  const revoke = vi.fn();
  const draft = new AttachmentDraft(new AttachmentUrlRegistry(revoke));
  draft.detach();
  const notify = vi.fn();
  draft.subscribe(notify);
  draft.replaceFiles([attachment('late')]);
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:late');
  expect(notify).not.toHaveBeenCalled();
});
