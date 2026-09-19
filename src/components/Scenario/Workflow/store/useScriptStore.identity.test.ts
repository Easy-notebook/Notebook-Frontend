import { expect, it } from 'vitest';
import useNotebookStore from '@Store/notebookStore';
import useScriptStore from './useScriptStore';

it('tracks the published title identity so subsequent updates reach the retained cell', () => {
  const notebook = useNotebookStore.getState();
  const script = useScriptStore.getState();
  try {
    notebook.setCells([{ id: 'placeholder', type: 'markdown', content: '# ', metadata: { isDefaultTitle: true } }]);
    const id = useScriptStore.getState().addCell('text', '# Generated title');
    expect(id).toBe('placeholder');
    expect(useScriptStore.getState().lastAddedActionId).toBe(id);
    useNotebookStore.getState().updateCell(id!, '# Updated title');
    expect(useNotebookStore.getState().cells[0]).toMatchObject({ id, content: '# Updated title' });
  } finally {
    useNotebookStore.setState(notebook, true);
    useScriptStore.setState(script, true);
  }
});
