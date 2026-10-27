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
