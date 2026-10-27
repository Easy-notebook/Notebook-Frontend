import { expect, it, vi } from 'vitest';
import type { Cell } from '@Store/models';
import { NotebookSourceSession } from './NotebookSourceSession';

const cells: Cell[] = [{ id: 'note', type: 'markdown', content: 'Before' }];
it('restores an edited session with stable added identities and live publication checks', () => {
  const original = new NotebookSourceSession('a', cells);
  original.appendCell('code');
  original.edit(original.source.replace('Before', 'After'));
  const checkpoint = JSON.parse(JSON.stringify(original.checkpoint()));
  const restored = NotebookSourceSession.restore(checkpoint);
  const unsaved = vi.fn();
  restored.subscribeUnsavedChanges(unsaved);
  expect(unsaved).toHaveBeenLastCalledWith(true);
  const publish = vi.fn();
  expect(restored.apply('other', cells, publish)).toBe(false);
  expect(publish).not.toHaveBeenCalled();
  expect(restored.apply('a', cells, publish)).toBe(true);
  expect(publish.mock.calls[0][0][1].id).toBe(checkpoint.document.addedCells[0].id);
  expect(publish.mock.calls[0][0][0].content).toBe('After');
  expect(unsaved).toHaveBeenLastCalledWith(false);
  expect(() => restored.checkpoint()).toThrow('closed');
});

it('retains malformed source for repair and rechecks conflicts instead of restoring stale status', () => {
  const original = new NotebookSourceSession('a', cells);
  const valid = original.source;
  original.edit(valid.replace(':0:end', ':9:end'));
  expect(original.apply('a', cells, vi.fn())).toBe(false);
  const restored = NotebookSourceSession.restore(JSON.parse(JSON.stringify(original.checkpoint())));
  expect(restored.source).toBe(original.source);
  expect(restored.state).toBe('editing');
  expect(restored.error).toBeNull();
  const publish = vi.fn();
  expect(restored.apply('a', cells, publish)).toBe(false);
  expect(publish).not.toHaveBeenCalled();
  restored.edit(valid.replace('Before', 'Recovered'));
  expect(restored.apply('a', cells, publish)).toBe(true);
});

it('does not checkpoint cancelled sessions or accept invalid session envelopes', () => {
  const session = new NotebookSourceSession('a', cells);
  const checkpoint = session.checkpoint();
  expect(() => NotebookSourceSession.restore({ ...checkpoint, version: 2 } as never)).toThrow(
    'Unsupported'
  );
  expect(() => NotebookSourceSession.restore({ ...checkpoint, source: null } as never)).toThrow(
    'Invalid'
  );
  expect(() => NotebookSourceSession.restore({ ...checkpoint, notebookId: 5 } as never)).toThrow(
    'Invalid'
  );
  session.cancel();
  expect(() => session.checkpoint()).toThrow('closed');
});
it('owns publication exclusively until the synchronous publisher returns', () => {
  const session = new NotebookSourceSession('a', cells);
  session.edit(session.source.replace('Before', 'After'));
  const nestedPublish = vi.fn();
  expect(
    session.apply('a', cells, () => {
      expect(session.state).toBe('applying');
      expect(() => session.edit('reentrant')).toThrow('being applied');
      expect(() => session.cancel()).toThrow('being applied');
      expect(() => session.apply('a', cells, nestedPublish)).toThrow('being applied');
    })
  ).toBe(true);
  expect(nestedPublish).not.toHaveBeenCalled();
  expect(session.state).toBe('applied');
});
it('does not publish when only textarea or pasted boundary newlines were normalized', () => {
  const originals: Cell[] = [{ id: 'lines', type: 'markdown', content: 'a\r\nb\r' }];
  const session = new NotebookSourceSession('a', originals);
  session.edit(session.source.replace(/\n/g, '\r\n'));
  const publish = vi.fn();
  expect(session.apply('a', originals, publish)).toBe(true);
  expect(publish).not.toHaveBeenCalled();
  expect(originals[0].content).toBe('a\r\nb\r');
});
it('keeps new cells local until apply and does not publish them on cancel', () => {
  const session = new NotebookSourceSession('a', cells);
  session.appendCell('code');
  expect(session.source).toContain('```python');
  session.cancel();
  expect(cells).toHaveLength(1);
  expect(() => session.appendCell('raw')).toThrow('closed');
  const applied = new NotebookSourceSession('a', cells);
  applied.appendCell('raw');
  const publish = vi.fn();
  expect(applied.apply('a', cells, publish)).toBe(true);
  expect(publish.mock.calls[0][0]).toHaveLength(2);
  expect(publish.mock.calls[0][0][1].type).toBe('raw');
});
it('applies once using the latest model and rejects further changes', () => {
  const session = new NotebookSourceSession('a', cells);
  session.edit(session.source.replace('Before', 'After'));
  const publish = vi.fn();
  const outputs = [{ type: 'text', content: 'latest' }];
  expect(session.apply('a', [{ ...cells[0], outputs }], publish)).toBe(true);
  expect(publish.mock.calls[0][0][0]).toMatchObject({ content: 'After', outputs });
  expect(session.state).toBe('applied');
  expect(() => session.edit('again')).toThrow('closed');
  expect(() => session.apply('a', cells, publish)).toThrow('closed');
  expect(publish).toHaveBeenCalledOnce();
});
it('retains the draft on conflict and permits correction and retry', () => {
  const session = new NotebookSourceSession('a', cells);
  const original = session.source;
  session.edit(original.replace('Before', 'After'));
  const publish = vi.fn();
  expect(session.apply('a', [{ ...cells[0], content: 'External' }], publish)).toBe(false);
  expect(session.state).toBe('conflicted');
  expect(session.source).toContain('After');
  expect(session.error).toContain('concurrently');
  expect(publish).not.toHaveBeenCalled();
  session.edit(original);
  expect(session.apply('a', [{ ...cells[0], content: 'External' }], publish)).toBe(true);
  expect(publish).not.toHaveBeenCalled();
});
it('does not write to a different notebook and cancellation never publishes', () => {
  const session = new NotebookSourceSession('a', cells);
  const publish = vi.fn();
  expect(session.apply('b', cells, publish)).toBe(false);
  expect(session.error).toContain('active notebook changed');
  session.cancel();
  expect(session.state).toBe('cancelled');
  expect(() => session.apply('a', cells, publish)).toThrow('closed');
  expect(publish).not.toHaveBeenCalled();
});
it('keeps the draft retryable when publication fails', () => {
  const session = new NotebookSourceSession('a', cells);
  session.edit(session.source.replace('Before', 'After'));
  expect(
    session.apply('a', cells, () => {
      throw new Error('Write failed');
    })
  ).toBe(false);
  expect(session.state).toBe('conflicted');
  expect(session.error).toBe('Write failed');
  expect(session.apply('a', cells, vi.fn())).toBe(true);
});
