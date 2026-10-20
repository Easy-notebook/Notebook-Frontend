import { expect, it, vi } from 'vitest';
import { NativeDatasetSession, type DatasetSnapshot } from './NativeDatasetSession';
import type { NativeDataset } from './NativeDatasetClient';

const file: NativeDataset = {
  name: 'a.csv',
  version: 'a'.repeat(64),
  sha256: 'b'.repeat(64),
  size: 3,
  csv: 'a\n1',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const client = { list: vi.fn(), read: vi.fn(), upload: vi.fn() };
  const changed = vi.fn<(state: DatasetSnapshot) => void>();
  const selected = vi.fn();
  return {
    client,
    changed,
    selected,
    session: new NativeDatasetSession(client, changed, selected),
  };
}
it('a newer selection owns publication even if the previous read ignores cancellation', async () => {
  const f = fixture();
  const first = deferred<NativeDataset>();
  f.client.read.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...file, csv: 'a\n2' });
  const old = f.session.read(file.version);
  await f.session.read('c'.repeat(64));
  first.resolve(file);
  await old;
  expect(f.selected).toHaveBeenCalledTimes(1);
  expect(f.selected).toHaveBeenCalledWith(expect.objectContaining({ csv: 'a\n2' }));
  expect(f.client.read.mock.calls[0][1].aborted).toBe(true);
});
it('leaving a notebook suppresses late upload success and all later operations', async () => {
  const f = fixture();
  const upload = deferred<NativeDataset>();
  f.client.upload.mockReturnValue(upload.promise);
  const input = {
    name: 'a.csv',
    size: 3,
    arrayBuffer: async () => new TextEncoder().encode('a\n1').buffer,
  } as File;
  const pending = f.session.upload(input);
  await vi.waitFor(() => expect(f.client.upload).toHaveBeenCalledTimes(1));
  f.session.dispose();
  upload.resolve(file);
  await pending;
  await f.session.refresh();
  expect(f.selected).not.toHaveBeenCalled();
  expect(f.changed).toHaveBeenCalledTimes(1);
  expect(f.client.list).not.toHaveBeenCalled();
});
it('retains prior selection on failure and permits the exact upload to be retried', async () => {
  const f = fixture();
  f.client.read.mockResolvedValue(file);
  await f.session.read(file.version);
  f.client.upload.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce(file);
  const input = {
    name: 'a.csv',
    size: 3,
    arrayBuffer: async () => new TextEncoder().encode('a\n1').buffer,
  } as File;
  await f.session.upload(input);
  expect(f.changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      phase: 'error',
      selected: expect.objectContaining({ version: file.version }),
    })
  );
  await f.session.upload(input);
  expect(f.client.upload.mock.calls.map((args) => args.slice(0, 2))).toEqual([
    ['a.csv', 'a\n1'],
    ['a.csv', 'a\n1'],
  ]);
  expect(f.selected).toHaveBeenCalledTimes(2);
});
it('preserves BOM and rejects lossy UTF-8 decoding before uploading', async () => {
  const f = fixture();
  f.client.upload.mockResolvedValue(file);
  await f.session.upload({
    name: 'a.csv',
    size: 6,
    arrayBuffer: async () => new TextEncoder().encode('\uFEFFa\n1').buffer,
  } as File);
  expect(f.client.upload).toHaveBeenCalledWith('a.csv', '\uFEFFa\n1', expect.any(AbortSignal));
  await f.session.upload({
    name: 'a.csv',
    size: 1,
    arrayBuffer: async () => new Uint8Array([255]).buffer,
  } as File);
  expect(f.client.upload).toHaveBeenCalledTimes(1);
  expect(f.changed).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }));
});
