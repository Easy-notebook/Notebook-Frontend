import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { decrypt, encrypt } from './encryption';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name, work) => work()) } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('concurrent first encryptions share the key retained for every ciphertext', async () => {
  const generate = vi.spyOn(window.crypto.subtle, 'generateKey');
  const values = ['first secret', '中文🧪', 'third secret'];
  const encrypted = await Promise.all(values.map(encrypt));
  expect(generate).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('enc_key')).toBeTruthy();
  expect(await Promise.all(encrypted.map(decrypt))).toEqual(values);
});

it('releases a failed key load so a later operation can retry', async () => {
  const generate = vi
    .spyOn(window.crypto.subtle, 'generateKey')
    .mockRejectedValueOnce(new Error('key service unavailable'));
  const failed = await Promise.allSettled([encrypt('one'), encrypt('two')]);
  expect(failed.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('enc_key')).toBeNull();
  const ciphertext = await encrypt('retry');
  expect(await decrypt(ciphertext)).toBe('retry');
  expect(generate).toHaveBeenCalledTimes(2);
});

it('does not retain a stale key after storage is reset between completed operations', async () => {
  await encrypt('before reset');
  const previous = localStorage.getItem('enc_key');
  localStorage.removeItem('enc_key');
  const ciphertext = await encrypt('after reset');
  expect(localStorage.getItem('enc_key')).not.toBe(previous);
  expect(await decrypt(ciphertext)).toBe('after reset');
});

it('preserves empty values without generating a key', async () => {
  expect(await encrypt('')).toBe('');
  expect(await decrypt('')).toBe('');
  expect(localStorage.getItem('enc_key')).toBeNull();
});

it('requires cross-tab ownership before creating a missing key', async () => {
  vi.stubGlobal('navigator', {});
  const generate = vi.spyOn(window.crypto.subtle, 'generateKey');
  await expect(encrypt('test')).rejects.toThrow('Failed to encrypt data');
  expect(generate).not.toHaveBeenCalled();
  expect(localStorage.getItem('enc_key')).toBeNull();
});

it('can read an existing key without entering initialization', async () => {
  const ciphertext = await encrypt('test');
  vi.stubGlobal('navigator', {});
  expect(await decrypt(ciphertext)).toBe('test');
});

it('rereads the stored key after waiting for initialization ownership', async () => {
  const ciphertext = await encrypt('existing');
  const stored = localStorage.getItem('enc_key')!;
  localStorage.removeItem('enc_key');
  const generate = vi.spyOn(window.crypto.subtle, 'generateKey');
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn(async (_name, work) => {
        localStorage.setItem('enc_key', stored);
        return work();
      }),
    },
  });
  expect(await decrypt(ciphertext)).toBe('existing');
  expect(generate).not.toHaveBeenCalled();
});
