import { expect, it, vi } from 'vitest';
import { NotebookSourceDraftRegistry } from './NotebookSourceDraftRegistry';

const cells = [{ id: 'cell', type: 'raw' as const, content: 'original' }];

it('restores source, redo, selection and viewport as one protected draft', () => {
  const registry = new NotebookSourceDraftRegistry();
  const draft = registry.open('restored', cells);
  const before = draft.session.source;
  draft.session.appendCell('code');
  const after = draft.session.source;
  draft.history.edit(after, 5, 5, false, true);
  draft.history.step(true);
  draft.session.edit(draft.history.source);
  draft.history.select(1, 4, true);
  draft.viewport.top = 240;
  const checkpoint = JSON.parse(JSON.stringify(registry.checkpoint(draft)));
  const { registry: target, warned } = guardedRegistry();
  const restored = target.restore(checkpoint);
  expect(target.open('restored', cells)).toBe(restored);
  expect(restored.session.source).toBe(before);
  expect(restored.history.selection.anchor).toBe(4);
  expect(restored.history.selection.head).toBe(1);
  expect(restored.viewport.top).toBe(240);
  expect(warned()).toBe(false);
  expect(restored.history.step(false)).toBe(true);
  restored.session.edit(restored.history.source);
  expect(restored.session.source).toBe(after);
  expect(warned()).toBe(true);
  const publish = vi.fn();
  expect(restored.session.apply('restored', cells, publish)).toBe(true);
  expect(publish.mock.calls[0][0][1].id).toBe(checkpoint.session.document.addedCells[0].id);
  expect(warned()).toBe(false);
});

it('rejects inconsistent checkpoints and never replaces an active draft', () => {
  const { registry, warned } = guardedRegistry();
  const draft = registry.open('a', cells);
  const checkpoint = registry.checkpoint(draft);
  expect(() => registry.restore(checkpoint)).toThrow('already exists');
  expect(() => registry.restore({ ...checkpoint, viewport: { top: NaN, left: 0 } })).toThrow(
    'viewport'
  );
  expect(() =>
    registry.restore({ ...checkpoint, session: { ...checkpoint.session, source: 'different' } })
  ).toThrow('out of sync');
  expect(registry.open('a', cells)).toBe(draft);
  expect(warned()).toBe(false);
  draft.session.edit('unrecorded edit');
  expect(() => registry.checkpoint(draft)).toThrow('out of sync');
});

function guardedRegistry() {
  const target = new EventTarget();
  const host = {
    addEventListener: vi.fn(target.addEventListener.bind(target)),
    removeEventListener: vi.fn(target.removeEventListener.bind(target)),
  };
  const registry = new NotebookSourceDraftRegistry(host as unknown as Window);
  const warned = () => {
    const event = new Event('beforeunload', { cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { registry, host, warned };
}

it('protects dirty detached notebooks with one unload listener and releases it with the last owner', () => {
  const { registry, host, warned } = guardedRegistry();
  const first = registry.open('a', cells);
  const second = registry.open('b', cells);
  registry.attach(first);
  expect(host.addEventListener).not.toHaveBeenCalled();
  expect(warned()).toBe(false);
  first.session.edit(first.session.source.replace('original', 'edited'));
  expect(host.addEventListener).toHaveBeenCalledTimes(1);
  registry.detach(first);
  expect(warned()).toBe(true);
  registry.release(second);
  expect(host.removeEventListener).not.toHaveBeenCalled();
  registry.release(first);
  expect(host.removeEventListener).toHaveBeenCalledTimes(1);
  expect(warned()).toBe(false);
  first.session.edit('a later edit to a released owner');
  expect(host.addEventListener).toHaveBeenCalledTimes(1);
});

it.each(['apply', 'cancel', 'undo'] as const)(
  'does not warn after %s resolves the dirty draft',
  (action) => {
    const { registry, host, warned } = guardedRegistry();
    const draft = registry.open('a', cells);
    const original = draft.session.source;
    draft.session.edit(original.replace('original', 'edited'));
    expect(warned()).toBe(true);
    if (action === 'apply') expect(draft.session.apply('a', cells, () => {})).toBe(true);
    else if (action === 'cancel') draft.session.cancel();
    else draft.session.edit(original);
    expect(warned()).toBe(false);
    expect(host.removeEventListener).toHaveBeenCalledTimes(1);
  }
);

it('protects an anonymous draft only while attached and permits effect replay', () => {
  const { registry, warned } = guardedRegistry();
  const draft = registry.open(null, cells);
  draft.session.edit('changed');
  expect(warned()).toBe(true);
  registry.detach(draft);
  expect(warned()).toBe(false);
  registry.attach(draft);
  expect(warned()).toBe(true);
  registry.release(draft);
  expect(warned()).toBe(false);
});

it('does not revive a released draft through a stale attachment', () => {
  const { registry, warned } = guardedRegistry();
  const stale = registry.open('a', cells);
  stale.session.edit('changed');
  registry.release(stale);
  const current = registry.open('a', cells);
  registry.attach(stale);
  expect(warned()).toBe(false);
  registry.release(current);
  expect(warned()).toBe(false);
});

it('keeps protection for other dirty notebooks and failed source application', () => {
  const { registry, host, warned } = guardedRegistry();
  const first = registry.open('a', cells);
  const second = registry.open('b', cells);
  first.session.edit('broken boundaries');
  second.session.edit('another unfinished draft');
  expect(host.addEventListener).toHaveBeenCalledTimes(1);
  expect(first.session.apply('a', cells, () => {})).toBe(false);
  expect(warned()).toBe(true);
  first.session.cancel();
  registry.release(first);
  expect(warned()).toBe(true);
  expect(host.removeEventListener).not.toHaveBeenCalled();
  second.session.cancel();
  expect(warned()).toBe(false);
  expect(host.removeEventListener).toHaveBeenCalledTimes(1);
});
it('keeps the same registry owner during publication', () => {
  const registry = new NotebookSourceDraftRegistry();
  const draft = registry.open('a', cells);
  draft.session.edit(draft.session.source.replace('original', 'edited'));
  expect(
    draft.session.apply('a', cells, () => {
      expect(registry.open('a', cells)).toBe(draft);
    })
  ).toBe(true);
});
it('does not let a stale attachment replace a newer draft owner', () => {
  const registry = new NotebookSourceDraftRegistry();
  const old = registry.open('a', cells);
  registry.release(old);
  const current = registry.open('a', cells);
  registry.attach(old);
  expect(registry.open('a', cells)).toBe(current);
  registry.release(old);
  expect(registry.open('a', cells)).toBe(current);
});
it('reattaches an open clean draft during effect replay without reviving cancelled drafts', () => {
  const registry = new NotebookSourceDraftRegistry();
  const draft = registry.open('a', cells);
  registry.detach(draft);
  registry.attach(draft);
  expect(registry.open('a', cells)).toBe(draft);
  draft.session.cancel();
  registry.detach(draft);
  const current = registry.open('a', cells);
  registry.attach(draft);
  expect(registry.open('a', cells)).toBe(current);
});
it('retains changed drafts and history across detach and isolates notebooks', () => {
  const registry = new NotebookSourceDraftRegistry();
  const draft = registry.open('a', cells);
  const edited = draft.session.source.replace('original', 'edited');
  draft.history.edit(edited, 0, 0);
  draft.session.edit(edited);
  registry.detach(draft);
  expect(registry.open('a', cells)).toBe(draft);
  expect(draft.history.canUndo).toBe(true);
  expect(registry.open('b', cells)).not.toBe(draft);
  registry.release(draft);
  expect(registry.open('a', cells)).not.toBe(draft);
});
it('releases clean drafts and does not retain anonymous notebooks', () => {
  const registry = new NotebookSourceDraftRegistry();
  const clean = registry.open('a', cells);
  registry.detach(clean);
  expect(registry.open('a', cells)).not.toBe(clean);
  expect(registry.open(null, cells)).not.toBe(registry.open(null, cells));
});

it('retains a clean source buffer when redo still owns unapplied edits', () => {
  const registry = new NotebookSourceDraftRegistry();
  const draft = registry.open('redo-draft', cells);
  const original = draft.session.source;
  const edited = original.replace('original', 'edited');
  draft.history.edit(edited, 0, 0);
  draft.session.edit(edited);
  expect(draft.history.step(true)).toBe(true);
  draft.session.edit(draft.history.source);
  expect(draft.session.hasEdits).toBe(false);
  registry.detach(draft);
  const resumed = registry.open('redo-draft', cells);
  expect(resumed).toBe(draft);
  expect(resumed.history.step(false)).toBe(true);
  resumed.session.edit(resumed.history.source);
  expect(resumed.session.source).toBe(edited);
  resumed.session.cancel();
  registry.detach(resumed);
  expect(registry.open('redo-draft', cells)).not.toBe(resumed);
});

it('keeps appended cell identities through undo, redo and a new history branch', () => {
  const registry = new NotebookSourceDraftRegistry();
  const draft = registry.open('append-history', cells);
  const append = (type: 'code' | 'raw') => {
    const length = draft.history.source.length;
    const cursor = draft.session.appendCell(type);
    draft.history.replace(length, length, draft.session.source.slice(length), cursor, cursor);
  };
  const step = (backward: boolean) => {
    expect(draft.history.step(backward)).toBe(true);
    draft.session.edit(draft.history.source);
  };
  append('code');
  const codeSource = draft.session.source;
  step(true);
  expect(draft.session.hasEdits).toBe(false);
  step(false);
  expect(draft.session.source).toBe(codeSource);
  step(true);
  append('raw');
  expect(draft.history.canRedo).toBe(false);
  const rawSource = draft.session.source;
  expect(rawSource).not.toBe(codeSource);
  step(true);
  step(false);
  expect(draft.session.source).toBe(rawSource);
  const publish = vi.fn();
  expect(draft.session.apply('append-history', cells, publish)).toBe(true);
  expect(publish).toHaveBeenCalledTimes(1);
  const applied = publish.mock.calls[0][0];
  expect(applied).toHaveLength(2);
  expect(applied[0]).toBe(cells[0]);
  expect(applied[1]).toMatchObject({ type: 'raw', content: '' });
  expect(applied[1].id).not.toBe(cells[0].id);
});
