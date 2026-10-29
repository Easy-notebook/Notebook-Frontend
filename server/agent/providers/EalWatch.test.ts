import { describe, it, expect } from 'vitest';
import { watchEal, watchEventSchema } from './EalWatch';

describe('EAL observer contract', () => {
  it('retains native receipt claims without upgrading them to local verification', () => {
    const event = {
      event: 'terminal',
      trace: 'trace',
      status: 'completed',
      ledger_reported_receipt_chain_verified: true,
      cli_receipt_chain_verification: { performed: false },
      usage: { tokens_in: 10 },
    };
    expect(watchEventSchema.parse(event)).toEqual(event);
  });
  it('keeps liveness separate from terminal execution', () => {
    expect(
      watchEventSchema.parse({ event: 'liveness', status: 'stale', source: 'local' }).event
    ).toBe('liveness');
    expect(() => watchEventSchema.parse({ event: 'terminal', status: 'stale' })).toThrow();
  });
  it('rejects CLI options as trace anchors before spawning', async () => {
    await expect(watchEal('--help', new AbortController().signal).next()).rejects.toThrow(
      'Invalid trace anchor'
    );
  });
  it('does not start an observer after unsubscribe', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(watchEal('trace', controller.signal).next()).rejects.toThrow();
  });
  it('reports missing executable instead of hanging or asserting completion', async () => {
    await expect(
      watchEal('trace', new AbortController().signal, '/nonexistent/easynet').next()
    ).rejects.toThrow();
  });
});
