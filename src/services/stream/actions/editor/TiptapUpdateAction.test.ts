import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useStore from '@Store/notebookStore';
import { TiptapUpdateAction } from './TiptapUpdateAction';
import { ActionCommandParser } from '../../commands/ActionCommandParser';
import type { StreamPayload } from '../../types';

const initial = useStore.getState();
beforeEach(() =>
  useStore.setState({
    notebookId: 'owner',
    cells: [
      { id: 'title', type: 'markdown', content: '# Title' },
      { id: 'target', type: 'markdown', content: 'original' },
    ],
    editingCellId: null,
  })
);
afterEach(() => useStore.setState(initial, true));

it.each([undefined, false])('appends when replacement is %s', (replace) => {
  new TiptapUpdateAction().execute({
    payload: { cellId: 'target', content: ' more', replace },
    showToast: vi.fn(),
  });
  expect(useStore.getState().cells[1].content).toBe('original more');
  expect(useStore.getState().editingCellId).toBe('target');
});

it('permits an explicit empty replacement to clear content', () => {
  new TiptapUpdateAction().execute({
    payload: { cellId: 'target', content: '', replace: true },
    showToast: vi.fn(),
  });
  expect(useStore.getState().cells[1].content).toBe('');
});

it.each(['false', 'true', 0, 1, null, {}])(
  'rejects malformed replacement mode %j before changing the document',
  (replace) => {
    const before = useStore.getState();
    const payload = {
      cellId: 'target',
      content: 'overwritten',
      replace,
    } as unknown as StreamPayload;
    expect(() => new TiptapUpdateAction().execute({ payload, showToast: vi.fn() })).toThrow(
      'must be a boolean'
    );
    expect(useStore.getState()).toBe(before);
  }
);

it('does not update a same-ID cell belonging to a different notebook', () => {
  const before = useStore.getState();
  new TiptapUpdateAction().execute({
    notebookId: 'different',
    payload: { cellId: 'target', content: 'wrong', replace: true },
    showToast: vi.fn(),
  });
  expect(useStore.getState()).toBe(before);
});

it('keeps command parsing compatible with boolean flags and reports invalid flags', async () => {
  expect(
    await ActionCommandParser.executeActionCommand(
      '/tiptap_update --cellId target --content tail --replace false',
      {}
    )
  ).toMatchObject({ success: true });
  expect(useStore.getState().cells[1].content).toBe('originaltail');
  expect(
    await ActionCommandParser.executeActionCommand(
      '/tiptap_update --cellId target --content replacement --replace true',
      {}
    )
  ).toMatchObject({ success: true });
  expect(useStore.getState().cells[1].content).toBe('replacement');
  expect(
    await ActionCommandParser.executeActionCommand(
      '/tiptap_update --cellId target --content wrong --replace invalid',
      {}
    )
  ).toMatchObject({ success: false });
  expect(useStore.getState().cells[1].content).toBe('replacement');
});
