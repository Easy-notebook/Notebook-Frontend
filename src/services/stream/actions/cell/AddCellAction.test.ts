import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useStore from '@Store/notebookStore';
import { AddCellAction } from './AddCellAction';
import { generationTracker } from '../../managers/GenerationTracker';
import type { StreamPayload } from '../../types';
const initial = useStore.getState();
beforeEach(() => {
  generationTracker.clear();
  useStore.setState({
    ...initial,
    notebookId: 'owner',
    cells: [{ id: 'title', type: 'markdown', content: '# Title' }],
    tasks: [],
  });
});
afterEach(() => {
  generationTracker.clear();
  useStore.setState(initial, true);
});
const execute = (payload: StreamPayload) =>
  new AddCellAction().execute({ payload, showToast: vi.fn() });

it('preserves explicitly empty content instead of substituting description', async () => {
  await execute({ type: 'code', content: '', description: 'description', commandId: 'command' });
  const cell = useStore.getState().cells[1];
  expect(cell).toMatchObject({ type: 'code', content: '' });
  expect(generationTracker.getCellId('command')).toBe(cell.id);
});

it('registers a generation identity without requiring a command ID and preserves canonical identity', async () => {
  await execute({
    type: 'video',
    description: 'video',
    uniqueIdentifier: 'canonical',
    metadata: { isGenerating: true, uniqueIdentifier: 'other', custom: 'kept' },
  });
  const cell = useStore.getState().cells[1];
  expect(cell.metadata).toMatchObject({
    uniqueIdentifier: 'canonical',
    isGenerating: true,
    custom: 'kept',
  });
  expect(generationTracker.getCellId('unique-canonical')).toBe(cell.id);
  expect(generationTracker.hasIdentifier('unique-other')).toBe(false);
});

it('uses the store-generated identity when only a generation prompt is supplied', async () => {
  await execute({
    type: 'image',
    content: 'image',
    prompt: 'draw test',
    metadata: { isGenerating: true },
  });
  const cell = useStore.getState().cells[1];
  expect(generationTracker.getCellId(`unique-${cell.metadata?.uniqueIdentifier}`)).toBe(cell.id);
});

it('captures metadata before creation subscribers can mutate the input', async () => {
  const metadata = { custom: { value: 'original' } };
  const unsubscribe = useStore.subscribe(() => {
    metadata.custom.value = 'changed';
  });
  try {
    await execute({ type: 'markdown', content: 'text', metadata });
  } finally {
    unsubscribe();
  }
  expect(useStore.getState().cells[1].metadata?.custom).toEqual({ value: 'original' });
});

it.each([[], { isGenerating: 'false' }, { uniqueIdentifier: 12 }])(
  'rejects malformed metadata before creating anything: %j',
  async (metadata) => {
    const before = useStore.getState();
    await expect(execute({ type: 'markdown', content: 'text', metadata })).rejects.toThrow();
    expect(useStore.getState()).toBe(before);
    expect(generationTracker.getSize()).toBe(0);
  }
);

it('does not register a cell removed by a creation subscriber', async () => {
  const unsubscribe = useStore.subscribe((state) => {
    if (state.cells.length > 1) useStore.setState({ cells: state.cells.slice(0, 1) });
  });
  try {
    await execute({ type: 'code', content: 'text', commandId: 'command' });
  } finally {
    unsubscribe();
  }
  expect(generationTracker.getSize()).toBe(0);
});

it('rejects a failed store creation without adding tracking entries', async () => {
  useStore.setState({
    addNewCell2End: () => {
      throw new Error('creation failed');
    },
  });
  await expect(execute({ type: 'code', content: 'text', commandId: 'failed' })).rejects.toThrow(
    'creation failed'
  );
  expect(generationTracker.getSize()).toBe(0);
  expect(useStore.getState().cells).toHaveLength(1);
});

it('ignores requests explicitly owned by another notebook', async () => {
  const before = useStore.getState();
  await new AddCellAction().execute({
    notebookId: 'different',
    payload: { type: 'code', content: 'text', commandId: 'wrong' },
    showToast: vi.fn(),
  });
  expect(useStore.getState()).toBe(before);
  expect(generationTracker.getSize()).toBe(0);
});
