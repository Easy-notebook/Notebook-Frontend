import { expect, it, vi } from 'vitest';
import { LaTeXModel } from './LaTeXModel';

it('ends editing without publishing unchanged formula content against the current context', () => {
  const updateAttributes = vi.fn();
  const context = { node: { attrs: { latex: 'x' } }, updateAttributes, deleteNode: vi.fn() };
  const fsm = LaTeXModel.createFSM(context, vi.fn());
  fsm.send('EDIT');
  fsm.send('SAVE', { latex: 'x' });
  expect(fsm.getCurrentState()).toBe('idle');
  expect(updateAttributes).not.toHaveBeenCalled();
  fsm.updateContext({ ...context, node: { attrs: { latex: 'y' } } });
  fsm.send('EDIT');
  fsm.send('SAVE', { latex: 'y' });
  expect(updateAttributes).not.toHaveBeenCalled();
  fsm.send('EDIT');
  fsm.send('SAVE', { latex: 'z' });
  expect(updateAttributes).toHaveBeenCalledExactlyOnceWith({ latex: 'z' });
});

it.each(['SAVE', 'CANCEL'])('ignores a delayed blur save after %s ended editing', (terminal) => {
  const updateAttributes = vi.fn();
  const fsm = LaTeXModel.createFSM(
    { node: { attrs: { latex: 'original' } }, updateAttributes, deleteNode: vi.fn() },
    vi.fn()
  );
  fsm.send('EDIT');
  fsm.send(terminal, { latex: 'draft' });
  expect(fsm.getCurrentState()).toBe('idle');
  fsm.send('SAVE', { latex: 'stale blur' });
  expect(updateAttributes).toHaveBeenCalledTimes(terminal === 'SAVE' ? 1 : 0);
  if (terminal === 'SAVE') expect(updateAttributes).toHaveBeenCalledWith({ latex: 'draft' });
  fsm.send('EDIT');
  fsm.send('SAVE', { latex: 'next session' });
  expect(updateAttributes).toHaveBeenLastCalledWith({ latex: 'next session' });
});

it('accepts an empty formula but does not save a missing payload', () => {
  const updateAttributes = vi.fn();
  const fsm = LaTeXModel.createFSM(
    { node: { attrs: {} }, updateAttributes, deleteNode: vi.fn() },
    vi.fn()
  );
  fsm.send('SAVE');
  expect(fsm.getCurrentState()).toBe('editing');
  expect(updateAttributes).not.toHaveBeenCalled();
  fsm.send('SAVE', { latex: '' });
  expect(updateAttributes).toHaveBeenCalledExactlyOnceWith({ latex: '' });
  expect(fsm.getCurrentState()).toBe('idle');
});
