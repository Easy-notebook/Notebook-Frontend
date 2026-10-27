import { createHash, webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeDatasetClient } from './NativeDatasetClient';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const name = '房屋.csv';
const csv = '\uFEFFarea,rooms\n40,2\n';
const item = {
  name,
  sha256: hash(csv),
  version: hash(`${name}\0${csv}`),
  size: new TextEncoder().encode(csv).length,
};
const response = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => vi.unstubAllGlobals());

it('verifies UTF-8 bytes and content identity, preserving the same request on repeated upload', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const request = vi.fn<typeof fetch>(async () =>
    response({ frontend_notebook_id: 'a/b', dataset: item })
  );
  const client = new NativeDatasetClient('a/b', request);
  expect(await client.upload(name, csv)).toEqual({ ...item, csv });
  await client.upload(name, csv);
  expect(request.mock.calls[0][1]?.body).toEqual(request.mock.calls[1][1]?.body);
  expect(request).toHaveBeenCalledWith(
    '/aal-api/workspaces/a%2Fb/datasets',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name, csv }),
    })
  );
});

it('rejects another owner, changed content, and a valid but unrequested version', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const request = vi
    .fn()
    .mockResolvedValueOnce(response({ frontend_notebook_id: 'b', dataset: { ...item, csv } }))
    .mockResolvedValueOnce(
      response({ frontend_notebook_id: 'a', dataset: { ...item, csv: csv.replace('40', '50') } })
    )
    .mockResolvedValueOnce(response({ frontend_notebook_id: 'a', dataset: { ...item, csv } }));
  const client = new NativeDatasetClient('a', request);
  await expect(client.read(item.version)).rejects.toThrow('identity mismatch');
  await expect(client.read(item.version)).rejects.toThrow('integrity');
  await expect(client.read('f'.repeat(64))).rejects.toThrow('version mismatch');
});

it('validates path, raw and encoded size before dispatch and rejects duplicate catalog versions', async () => {
  const request = vi.fn(async () =>
    response({ frontend_notebook_id: 'a', datasets: [item, item] })
  );
  const client = new NativeDatasetClient('a', request);
  await expect(client.upload('../a.csv', csv)).rejects.toThrow('CSV');
  await expect(client.upload('a.csv', 'x'.repeat(4 * 1024 * 1024 + 1))).rejects.toThrow('4 MiB');
  await expect(client.upload('a.csv', '\0'.repeat(1024 * 1024))).rejects.toThrow('5 MiB');
  await expect(client.read('../state')).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  await expect(client.list()).rejects.toThrow('catalog');
});

it('an aborted transport cannot return an accepted dataset even when fetch ignores the signal', async () => {
  const controller = new AbortController();
  const request = vi.fn(async () => {
    controller.abort();
    return response({ frontend_notebook_id: 'a', datasets: [] });
  });
  await expect(new NativeDatasetClient('a', request).list(controller.signal)).rejects.toThrow();
});

it('downloads immutable raw bytes without stripping BOM or changing line endings', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const body = new TextEncoder().encode(csv);
  const request = vi.fn(async () => new Response(body));
  const blob = await new NativeDatasetClient('a/b', request).download(item);
  const saved = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  expect(Array.from(new Uint8Array(saved))).toEqual(Array.from(body));
  expect(request).toHaveBeenCalledExactlyOnceWith(
    `/aal-api/workspaces/a%2Fb/datasets/${item.version}/download`,
    expect.objectContaining({ method: 'GET', cache: 'no-store', signal: expect.any(AbortSignal) })
  );
});

it('rejects corrupted, truncated, oversized and invalid UTF-8 downloads before creating a file', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(csv.replace('40', '50')))
    .mockResolvedValueOnce(new Response('area\n'))
    .mockResolvedValueOnce(new Response(csv + 'x'))
    .mockResolvedValueOnce(new Response(new Uint8Array([255])));
  const client = new NativeDatasetClient('a', request);
  await expect(client.download(item)).rejects.toThrow('integrity');
  await expect(client.download(item)).rejects.toThrow('integrity');
  await expect(client.download(item)).rejects.toThrow('byte limit');
  await expect(client.download(item)).rejects.toThrow();
});

it('propagates native download rejection and suppresses a response after cancellation', async () => {
  const rejected = vi.fn(
    async () => new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 409 })
  );
  await expect(new NativeDatasetClient('a', rejected).download(item)).rejects.toThrow('busy');
  const controller = new AbortController();
  const request = vi.fn(async () => {
    controller.abort();
    return new Response(csv);
  });
  await expect(
    new NativeDatasetClient('a', request).download(item, controller.signal)
  ).rejects.toThrow();
});
