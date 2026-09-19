import { expect, it } from 'vitest';
import { NotebookSourceDraftRegistry } from './NotebookSourceDraftRegistry';

const cells = [{ id: 'cell', type: 'raw' as const, content: 'original' }];
it('keeps the same registry owner during publication', () => {
  const registry = new NotebookSourceDraftRegistry();
  const draft = registry.open('a', cells);
  draft.session.edit(draft.session.source.replace('original', 'edited'));
  expect(draft.session.apply('a', cells, () => {
    expect(registry.open('a', cells)).toBe(draft);
  })).toBe(true);
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
