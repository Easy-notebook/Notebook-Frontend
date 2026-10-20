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
