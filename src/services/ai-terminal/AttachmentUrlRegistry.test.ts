import { expect, it, vi } from 'vitest';
import { AttachmentUrlRegistry } from './AttachmentUrlRegistry';
it('releases only the final lease and makes each release idempotent', () => {
  const revoke = vi.fn();
  const registry = new AttachmentUrlRegistry(revoke);
  expect(registry.retainExisting('blob:a')).toBeUndefined();
  const first = registry.acquire('blob:a');
  const second = registry.retainExisting('blob:a')!;
  first();
  first();
  expect(revoke).not.toHaveBeenCalled();
  second();
  second();
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
  expect(registry.retainExisting('blob:a')).toBeUndefined();
});
it('does not revoke non-object URLs', () => {
  const revoke = vi.fn();
  const registry = new AttachmentUrlRegistry(revoke);
  registry.acquire('https://example.com/file')();
  expect(revoke).not.toHaveBeenCalled();
});
