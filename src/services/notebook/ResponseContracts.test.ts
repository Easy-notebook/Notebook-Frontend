import { afterEach, expect, it, vi } from 'vitest';
import { FileService } from './FileService';
import { OperationService } from './OperationService';
import { HttpResponseError } from './HttpResponseError';

vi.mock('@Utils/logger', () => ({ apiLog: { error: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

const consumers = [
  ['download', () => FileService.downloadFile('book', 'file.bin')],
  ['operation', () => OperationService.sendOperation('book', { type: 'check', payload: {} })],
] as const;

for (const [name, consume] of consumers) {
  it.each([
    ['{"message":"Access denied"}', 'Access denied'],
    ['Gateway unavailable', 'Gateway unavailable'],
    ['', 'HTTP error! status: 403'],
  ])(`${name} retains HTTP failure details for %j`, async (body, message) => {
    const response = new Response(body, { status: 403 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const text = vi.spyOn(response, 'text');
    const failure = await consume().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HttpResponseError);
    expect(failure).toMatchObject({ status: 403, message });
    expect(text).toHaveBeenCalledTimes(1);
  });
}

it('returns download bytes without attempting JSON or text decoding', async () => {
  const bytes = new Uint8Array([0, 255, 1, 128]);
  const response = new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } });
  const json = vi.spyOn(response, 'json');
  const text = vi.spyOn(response, 'text');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  const file = await FileService.downloadFile('book', 'file.bin');
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  expect(file.type).toBe('application/octet-stream');
  expect(json).not.toHaveBeenCalled();
  expect(text).not.toHaveBeenCalled();
});

it('returns the original stream unlocked and unconsumed', async () => {
  const response = new Response('data: update\n\n');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  const body = await OperationService.sendOperation('book', { type: 'check', payload: {} });
  expect(body).toBe(response.body);
  expect(body?.locked).toBe(false);
  expect(response.bodyUsed).toBe(false);
  expect(await new Response(body).text()).toBe('data: update\n\n');
});

it('preserves the nullable stream contract for successful responses without a body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  await expect(
    OperationService.sendOperation('book', { type: 'check', payload: {} })
  ).resolves.toBeNull();
});
