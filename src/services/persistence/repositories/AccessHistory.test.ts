import { expect, it } from 'vitest';
import { AccessHistory } from './AccessHistory';

it('records one access without exposing or mutating the prior history', () => {
  const input = { accessCount: 3, lastAccessedAt: 10 };
  const history = new AccessHistory(input);
  input.accessCount = 99;
  const updated = history.accessedAt(20).toRecord();
  expect(updated).toEqual({ accessCount: 4, lastAccessedAt: 20 });
  updated.accessCount = 100;
  expect(history.toRecord()).toEqual({ accessCount: 3, lastAccessedAt: 10 });
});

it.each([NaN, Infinity, -1, 1.5, '1', undefined])(
  'rejects malformed history fields %j',
  (value) => {
    expect(() => new AccessHistory({ accessCount: value as number, lastAccessedAt: 0 })).toThrow(
      'Invalid storage access history'
    );
    expect(() => new AccessHistory({ accessCount: 0, lastAccessedAt: value as number })).toThrow(
      'Invalid storage access history'
    );
  }
);

it('rejects counter overflow and invalid new timestamps', () => {
  expect(() =>
    new AccessHistory({ accessCount: Number.MAX_SAFE_INTEGER, lastAccessedAt: 0 }).accessedAt(10)
  ).toThrow('overflow');
  expect(() => new AccessHistory({ accessCount: 0, lastAccessedAt: 0 }).accessedAt(NaN)).toThrow(
    'Invalid storage access history'
  );
});

it('merges independent observed maxima without incrementing or mutating either history', () => {
  const older = new AccessHistory({ accessCount: 9, lastAccessedAt: 10 });
  const newer = new AccessHistory({ accessCount: 2, lastAccessedAt: 20 });
  expect(older.merge(newer).toRecord()).toEqual({ accessCount: 9, lastAccessedAt: 20 });
  expect(newer.merge(older).toRecord()).toEqual(older.merge(newer).toRecord());
  expect(older.observedAt(30).toRecord()).toEqual({ accessCount: 9, lastAccessedAt: 30 });
  expect(older.toRecord()).toEqual({ accessCount: 9, lastAccessedAt: 10 });
});
