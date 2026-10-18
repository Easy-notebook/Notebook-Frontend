import { expect, it } from 'vitest';
import { StorageUsage } from './StorageUsage';

it('counts recovery bodies and bases separately without creating notebook eviction credits', () => {
  const usage = new StorageUsage([], []);
  usage.addRecoveryContent({ content: '你好', expectedContent: '😀' });
  expect(usage.toStats()).toMatchObject({
    recoveryCopies: 1,
    recoveryContentBytes: 6,
    recoveryBaselineBytes: 4,
    totalContentBytes: 10,
    orphanContentBytes: 0,
    totalSize: 0,
  });
  expect(usage.toContentUsage()).toEqual({ totalBytes: 10, bytesByNotebook: new Map() });
});

it('includes recovery alongside orphan strings while keeping their ownership classifications distinct', () => {
  const usage = new StorageUsage([], []);
  usage.addFileContent({ fileId: 'orphan', content: 'é', compressed: false, encoding: 'utf8' });
  usage.addRecoveryContent({ content: '你好', expectedContent: '😀' });
  expect(usage.toStats()).toMatchObject({
    localContentBytes: 2,
    orphanContentBytes: 2,
    recoveryCopies: 1,
    totalContentBytes: 12,
  });
});

it('counts empty records and returns detached snapshots without charging an absent base', () => {
  const usage = new StorageUsage([], []);
  usage.addRecoveryContent({ content: '', expectedContent: null });
  const before = usage.toStats();
  usage.addRecoveryContent({ content: 'a', expectedContent: '' });
  expect(before).toMatchObject({ recoveryCopies: 1, totalContentBytes: 0 });
  expect(usage.toStats()).toMatchObject({
    recoveryCopies: 2,
    recoveryContentBytes: 1,
    recoveryBaselineBytes: 0,
    totalContentBytes: 1,
  });
});

it('rejects malformed recovery payloads instead of silently undercounting them', () => {
  const usage = new StorageUsage([], []);
  expect(() =>
    usage.addRecoveryContent({ content: 'a', expectedContent: undefined as unknown as null })
  ).toThrow('Invalid recovery content');
  expect(usage.toStats().recoveryCopies).toBe(0);
});
