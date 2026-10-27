import { afterEach, expect, it, vi } from 'vitest';
import { SkillModelClient } from './SkillModelClient';
const entry = {
  skill: 'houses',
  source: 'local',
  location: 'package',
  content_hash: 'hash',
  path: 'models/houses.aalkm',
  model: {
    version: 1,
    training_rows: 12,
    features: [{ name: 'area', mean: 100, scale: 10 }],
    centers: [[-1], [1]],
  },
};
afterEach(() => vi.unstubAllGlobals());
it('sends a frozen lock to Rust and binds all returned models to the notebook', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ frontend_notebook_id: 'houses', models: [entry] }),
  });
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  const lock = { version: 1, skills: [] };
  expect(await new SkillModelClient('houses').inspect(lock, signal)).toEqual([entry]);
  expect(fetch.mock.calls[0][0]).toBe('/aal-api/workspaces/houses/model-file/skill-lock');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ lock });
  expect(fetch.mock.calls[0][1].signal).toBe(signal);
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ frontend_notebook_id: 'other', models: [entry] }),
  });
  await expect(new SkillModelClient('houses').inspect(lock, signal)).rejects.toThrow();
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ frontend_notebook_id: 'houses', models: [{ ...entry, model: {} }] }),
  });
  await expect(new SkillModelClient('houses').inspect(lock, signal)).rejects.toThrow();
});
