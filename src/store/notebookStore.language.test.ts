import { expect, it, vi } from 'vitest';
import { AutoSaveService } from '@Services/autoSave';
import useStore from './notebookStore';

it('preserves the saved execution language and output when loading a notebook', async () => {
  const original = useStore.getState();
  const cells = [
    { id: 'title', type: 'markdown' as const, content: '# Native notebook' },
    {
      id: 'native',
      type: 'code' as const,
      language: 'aal',
      content: 'native source',
      outputs: [{ type: 'text', content: 'native result' }],
    },
    { id: 'python', type: 'code' as const, language: 'python', content: '1' },
  ];
  const load = vi.spyOn(AutoSaveService.getInstance(), 'load').mockResolvedValue({
    notebookTitle: 'Native notebook',
    cells,
    tasks: [],
  });
  try {
    expect(await useStore.getState().loadFromDatabase('book')).toBe(true);
    expect(useStore.getState().cells.find((cell) => cell.id === 'native')).toMatchObject(cells[1]);
    expect(useStore.getState().cells.find((cell) => cell.id === 'python')?.language).toBe('python');
  } finally {
    load.mockRestore();
    useStore.setState(original, true);
  }
});

it('clears only the changed language output, preserving other code and Agent cells', () => {
  const original = useStore.getState();
  const other = {
    id: 'other',
    type: 'code' as const,
    language: 'aal',
    content: '1',
    outputs: [{ type: 'text', content: '391' }],
  };
  const agent = { id: 'agent', type: 'agent' as const, content: 'keep context' };
  try {
    useStore.getState().setCells([
      {
        id: 'diagram',
        type: 'code',
        language: 'mermaid',
        content: 'graph TD; A-->B',
        outputs: [{ type: 'image', content: 'old diagram' }],
      },
      other,
      agent,
    ]);
    const before = useStore.getState().cells;
    useStore.getState().updateCellObject('diagram', { language: 'javascript' });
    expect(useStore.getState().cells[0].outputs).toEqual([]);
    expect(useStore.getState().cells[1]).toBe(before[1]);
    expect(useStore.getState().cells[2]).toBe(before[2]);
  } finally {
    useStore.setState(original, true);
  }
});
