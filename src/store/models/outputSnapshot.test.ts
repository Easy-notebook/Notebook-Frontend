import { expect, it } from 'vitest';
import { reconcileOutputSnapshot } from './outputSnapshot';

it('does not merge separate rows that happen to contain identical text', () => {
  const previous = [
    { type: 'text', content: 'same' },
    { type: 'text', content: 'same' },
  ];
  const next = reconcileOutputSnapshot(
    previous,
    previous.map((value) => ({ ...value }))
  );
  expect(next).toBe(previous);
  expect(next[0]).not.toBe(next[1]);
});

it('does not hide removed fields or changed nested metadata references', () => {
  const previous = [{ type: 'text', content: 'same', key: 'a', metadata: { value: 1 } }];
  const changed = [{ ...previous[0], metadata: { value: 2 } }];
  expect(reconcileOutputSnapshot(previous, changed)[0]).toBe(changed[0]);
  const removed = [{ type: 'text', content: 'same' }];
  expect(reconcileOutputSnapshot(previous, removed)[0]).toBe(removed[0]);
});

it('preserves surviving rows on truncation without mutating either snapshot', () => {
  const previous = [
    { type: 'text', content: 'first' },
    { type: 'text', content: 'second' },
  ];
  const incoming = [{ ...previous[0] }];
  const next = reconcileOutputSnapshot(previous, incoming);
  expect(next).toHaveLength(1);
  expect(next[0]).toBe(previous[0]);
  expect(incoming[0]).not.toBe(previous[0]);
  expect(previous).toHaveLength(2);
});
