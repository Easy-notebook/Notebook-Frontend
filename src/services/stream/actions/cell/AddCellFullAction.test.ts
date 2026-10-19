import { afterEach, beforeEach, expect, it } from 'vitest';
import useStore from '@Store/notebookStore';
import { AddCellFullAction } from './AddCellFullAction';
import { ActionCommandParser } from '../../commands/ActionCommandParser';
import type { StreamPayload } from '../../types';

const initial = useStore.getState();
beforeEach(() =>
  useStore.setState({
    ...initial,
    cells: [
      { id: 'title', type: 'markdown', content: '# Notebook' },
      { id: 'existing', type: 'markdown', content: 'Existing' },
    ],
    tasks: [],
  })
);
afterEach(() => useStore.setState(initial));

it.each([
  [undefined, ['title', 'existing', 'new']],
  ['end', ['title', 'existing', 'new']],
  ['start', ['new', 'title', 'existing']],
  [1, ['title', 'new', 'existing']],
] as const)('inserts a full cell at %s through the store-owned insertion path', (position, ids) => {
  new AddCellFullAction().execute({
    payload: {
      position,
      cell: {
        id: 'new',
        type: 'code',
        content: 'print(1)',
        language: 'python',
        metadata: { retained: true },
      },
    },
    showToast: async () => {},
  });
  const state = useStore.getState();
  expect(state.cells.map((cell) => cell.id)).toEqual(ids);
  expect(state.currentCellId).toBe('new');
  expect(state.cells.find((cell) => cell.id === 'new')).toMatchObject({
    language: 'python',
    metadata: { retained: true },
  });
});

it('executes the documented CLI flags and publishes the requested cell', async () => {
  const result = await ActionCommandParser.executeActionCommand(
    '/add_cell --type code --content "print(1)" --id requested --position 1',
    {}
  );
  expect(result.success).toBe(true);
  const state = useStore.getState();
  expect(state.cells[1]).toMatchObject({ id: 'requested', type: 'code', content: 'print(1)' });
  expect(state.currentCellId).toBe('requested');
});

it('preserves an explicit cell object while mapping command flags', () => {
  const cell = { id: 'explicit', type: 'markdown', content: 'kept', metadata: { custom: true } };
  const payload: StreamPayload = ActionCommandParser.commandToPayload({
    actionType: 'add_cell',
    args: ['ignored'],
    flags: { cell, position: 'start' },
  });
  expect(payload.cell).toBe(cell);
  new AddCellFullAction().execute({ payload, showToast: async () => {} });
  expect(useStore.getState().cells[0]).toMatchObject(cell);
});

it.each(['middle', '-1', '1.5', '9007199254740992'])(
  'rejects invalid CLI position %s without publishing',
  async (position) => {
    const before = useStore.getState();
    const result = await ActionCommandParser.executeActionCommand(
      `/add_cell --content text --position ${position}`,
      {}
    );
    expect(result.success).toBe(false);
    expect(useStore.getState()).toBe(before);
  }
);

it.each([null, [], 'text'])('rejects malformed cell objects %j before publication', (cell) => {
  const before = useStore.getState();
  expect(() =>
    new AddCellFullAction().execute({ payload: { cell }, showToast: async () => {} })
  ).toThrow('cell object');
  expect(useStore.getState()).toBe(before);
});

it('generates and selects an identity for the documented command without an ID', async () => {
  const result = await ActionCommandParser.executeActionCommand(
    '/add_cell --type code --content "print(1)"',
    {}
  );
  expect(result.success).toBe(true);
  const state = useStore.getState();
  expect(state.cells).toHaveLength(3);
  expect(state.cells[2]).toMatchObject({ type: 'code', content: 'print(1)' });
  expect(state.currentCellId).toBe(state.cells[2].id);
  expect(typeof state.currentCellId).toBe('string');
});

it('rejects a non-string cell identity before publishing', async () => {
  const before = useStore.getState();
  const result = await ActionCommandParser.executeActionCommand(
    '/add_cell --id 123 --content text',
    {}
  );
  expect(result).toMatchObject({ success: false, error: 'Cell identity must be a string' });
  expect(useStore.getState()).toBe(before);
});
