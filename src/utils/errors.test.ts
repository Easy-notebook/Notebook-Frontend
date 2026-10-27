import { expect, it } from 'vitest';
import { describeError } from './errors';

it('does not let a throwing message accessor break error reporting', () => {
  const failure = {
    get message(): string {
      throw new Error('unreadable');
    },
  };
  expect(describeError(failure)).toBe('Unknown error');
});

it('preserves useful Error and primitive messages', () => {
  expect(describeError(new Error('quota'))).toBe('quota');
  expect(describeError(503)).toBe('503');
  expect(describeError(undefined)).toBe('Unknown error');
});
