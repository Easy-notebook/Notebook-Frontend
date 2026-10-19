import { expect, it } from 'vitest';
import { SpreadsheetSaveSession } from './SpreadsheetSaveSession';

function session() {
  const value = new SpreadsheetSaveSession();
  expect(value.receiveSource('normal:book::file', 'original')).toBe(true);
  return value;
}

it('acknowledges only the submitted revision and suppresses its commit echo', () => {
  const value = session();
  value.changed();
  const save = value.begin('saved');
  expect(value.receiveSource('normal:book::file', 'saved')).toBe(false);
  expect(value.complete(save, 'saved')).toBe(true);
});

it('retains newer edits whether the echo arrives before or after the promise resolves', () => {
  for (const echoFirst of [false, true]) {
    const value = session();
    const save = value.begin('saved');
    value.changed();
    if (echoFirst) expect(value.receiveSource('normal:book::file', 'saved')).toBe(false);
    expect(value.complete(save, 'saved')).toBe(false);
    if (!echoFirst) expect(value.receiveSource('normal:book::file', 'saved')).toBe(false);
  }
});

it('obsolete completions cannot acknowledge a later save', () => {
  const value = session();
  const first = value.begin('first');
  value.changed();
  const second = value.begin('second');
  expect(value.complete(first, 'first')).toBe(false);
  expect(value.complete(second, 'second')).toBe(true);
});

it.each([null, 'different committed revision'])(
  'does not acknowledge failure or a different readback: %s',
  (result) => {
    const value = session();
    const save = value.begin('saved');
    expect(value.complete(save, result)).toBe(false);
  }
);

it('a file, surface or external-content change revokes prior saves', () => {
  for (const [key, content] of [
    ['split:book::file', 'original'],
    ['normal:other::file', 'original'],
    ['normal:book::file', 'external'],
  ]) {
    const value = session();
    const save = value.begin('saved');
    expect(value.receiveSource(key, content)).toBe(true);
    expect(value.complete(save, 'saved')).toBe(false);
  }
});

it('unmount revokes pending acknowledgements and previously accepted echoes', () => {
  const value = session();
  const save = value.begin('saved');
  value.close();
  expect(value.complete(save, 'saved')).toBe(false);
  expect(value.receiveSource('normal:book::file', 'saved')).toBe(true);
});
