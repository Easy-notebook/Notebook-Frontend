import { afterEach, expect, it, vi } from 'vitest';
import { ModelFileClient } from './ModelFileClient';
const model = {
  version: 1,
  training_rows: 12,
  features: [{ name: 'area', mean: 100, scale: 10 }],
  centers: [[-1], [1]],
};
afterEach(() => vi.unstubAllGlobals());
it('transfers binary bytes to native decoding and checks the notebook identity', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ frontend_notebook_id: 'houses', model }) });
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  expect(
    JSON.parse(await new ModelFileClient('houses').decode(new Uint8Array([0, 255]), signal))
  ).toEqual(model);
  expect(fetch.mock.calls[0][0]).toBe('/aal-api/workspaces/houses/model-file/decode');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ bytes: [0, 255] });
  expect(fetch.mock.calls[0][1].signal).toBe(signal);
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ frontend_notebook_id: 'other', model }),
  });
  await expect(new ModelFileClient('houses').decode(new Uint8Array([0]))).rejects.toThrow();
});
it('bounds local binary input and validates every exported byte', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ frontend_notebook_id: 'houses', bytes: Array(48).fill(256) }),
  });
  vi.stubGlobal('fetch', fetch);
  await expect(new ModelFileClient('houses').decode(new Uint8Array(32769))).rejects.toThrow(
    '32 KiB'
  );
  expect(fetch).not.toHaveBeenCalled();
  await expect(
    new ModelFileClient('houses').encode(JSON.stringify(model), new AbortController().signal)
  ).rejects.toThrow();
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ frontend_notebook_id: 'houses', bytes: Array(48).fill(0) }),
  });
  expect(
    (
      await new ModelFileClient('houses').encode(
        JSON.stringify(model),
        new AbortController().signal
      )
    ).length
  ).toBe(48);
});
