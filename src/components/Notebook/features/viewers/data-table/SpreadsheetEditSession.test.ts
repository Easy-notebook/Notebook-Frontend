import { expect, it } from 'vitest';
import { SpreadsheetEditSession } from './SpreadsheetEditSession';

function session() {
  const value = new SpreadsheetEditSession();
  expect(value.receiveSource('normal:book::file', 'original')).toBe(true);
  return value;
}

it('acknowledges only the submitted revision and suppresses its commit echo', () => {
  const value = session();
  value.changed();
  const save = value.beginSave('saved');
  expect(value.receiveSource('normal:book::file', 'saved')).toBe(false);
  expect(value.completeSave(save, 'saved')).toBe(true);
});

it('retains newer edits whether the echo arrives before or after the promise resolves', () => {
  for (const echoFirst of [false, true]) {
    const value = session();
    const save = value.beginSave('saved');
    value.changed();
    if (echoFirst) expect(value.receiveSource('normal:book::file', 'saved')).toBe(false);
    expect(value.completeSave(save, 'saved')).toBe(false);
    if (!echoFirst) expect(value.receiveSource('normal:book::file', 'saved')).toBe(false);
  }
});

it('obsolete completions cannot acknowledge a later save', () => {
  const value = session();
  const first = value.beginSave('first');
  value.changed();
  const second = value.beginSave('second');
  expect(value.completeSave(first, 'first')).toBe(false);
  expect(value.completeSave(second, 'second')).toBe(true);
});

it.each([null, 'different committed revision'])(
  'does not acknowledge failure or a different readback: %s',
  (result) => {
    const value = session();
    const save = value.beginSave('saved');
    expect(value.completeSave(save, result)).toBe(false);
  }
);

it('a file, surface or external-content change revokes prior saves', () => {
  for (const [key, content] of [
    ['split:book::file', 'original'],
    ['normal:other::file', 'original'],
    ['normal:book::file', 'external'],
  ]) {
    const value = session();
    const save = value.beginSave('saved');
    expect(value.receiveSource(key, content)).toBe(true);
    expect(value.completeSave(save, 'saved')).toBe(false);
  }
});

it('unmount revokes pending acknowledgements and previously accepted echoes', () => {
  const value = session();
  const save = value.beginSave('saved');
  value.close();
  expect(value.completeSave(save, 'saved')).toBe(false);
  expect(value.receiveSource('normal:book::file', 'saved')).toBe(true);
});

it('admits only the latest deferred edit once, independent of completion order', () => {
  const value = session();
  const first = value.beginDeferredEdit()!;
  const second = value.beginDeferredEdit()!;
  expect(value.completeDeferredEdit(first, true)).toBe(false);
  expect(value.completeDeferredEdit(second, true)).toBe(true);
  expect(value.completeDeferredEdit(second, true)).toBe(false);
});

it('rejects deferred edits after a draft change, source change or close', () => {
  for (const invalidate of [
    (value: SpreadsheetEditSession) => value.changed(),
    (value: SpreadsheetEditSession) => value.receiveSource('other', 'different'),
    (value: SpreadsheetEditSession) => value.close(),
  ]) {
    const value = session();
    const edit = value.beginDeferredEdit()!;
    invalidate(value);
    expect(value.completeDeferredEdit(edit, true)).toBe(false);
  }
});

it('a failed obsolete clipboard operation cannot revoke a newer one', () => {
  const value = session();
  const first = value.beginDeferredEdit()!;
  const second = value.beginDeferredEdit()!;
  expect(value.completeDeferredEdit(first, false)).toBe(false);
  expect(value.completeDeferredEdit(second, true)).toBe(true);
});

it('rejects a failed deferred edit and allows a subsequent attempt', () => {
  const value = session();
  expect(value.completeDeferredEdit(value.beginDeferredEdit()!, false)).toBe(false);
  expect(value.completeDeferredEdit(value.beginDeferredEdit()!, true)).toBe(true);
});
