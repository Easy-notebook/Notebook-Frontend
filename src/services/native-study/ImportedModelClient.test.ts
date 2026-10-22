import { afterEach, expect, it, vi } from 'vitest';
import { ImportedModelClient } from './ImportedModelClient';
const model = JSON.stringify({
  version: 1,
  training_rows: 12,
  features: [{ name: 'area', mean: 100, scale: 10 }],
  centers: [[-1], [1]],
});
const response = {
  frontend_notebook_id: 'notebook',
  workspace: 'workspace',
  revision: 3,
  assignments: [
    {
      row: 0,
      cluster: 1,
      distance_squared: 0,
      terms: [
        {
          feature: 'area',
          value: 110,
          center: 110,
          standardized_difference: 0,
          squared_distance: 0,
        },
      ],
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
it('sends model data and checks the exact response owner and revision', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => response });
  vi.stubGlobal('fetch', request);
  const signal = new AbortController().signal;
  expect(
    await new ImportedModelClient('notebook').assign('workspace', 3, model, 'area\n110\n', signal)
  ).toEqual(response.assignments);
  expect(request.mock.calls[0][0]).toBe('/aal-api/workspaces/notebook/model-assignment');
  expect(JSON.parse(request.mock.calls[0][1].body).model).toEqual(JSON.parse(model));
  expect(request.mock.calls[0][1].signal).toBe(signal);
});
it.each(['frontend_notebook_id', 'workspace', 'revision'])(
  'rejects a different %s',
  async (field) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...response, [field]: field === 'revision' ? 4 : 'other' }),
      })
    );
    await expect(
      new ImportedModelClient('notebook').assign(
        'workspace',
        3,
        model,
        'area\n110\n',
        new AbortController().signal
      )
    ).rejects.toThrow('不匹配');
  }
);
it('rejects malformed and oversized files before a request', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  for (const text of ['{}', ' '.repeat(128 * 1024 + 1)]) {
    await expect(
      new ImportedModelClient('notebook').assign(
        'workspace',
        3,
        text,
        'area\n110\n',
        new AbortController().signal
      )
    ).rejects.toThrow();
  }
  expect(request).not.toHaveBeenCalled();
});
