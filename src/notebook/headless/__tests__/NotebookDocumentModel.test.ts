import { describe, expect, it } from 'vitest';
import {
  EasyNotebookDocumentModel,
  createNotebookCell,
  reduceEasyNotebookDocument,
} from '../NotebookDocumentModel';

describe('EasyNotebookDocumentModel', () => {
  it('updates cells immutably for host-managed stores', () => {
    const first = createNotebookCell('markdown', { id: 'first', content: 'before' });
    const model = EasyNotebookDocumentModel.empty({ cells: [first] });

    const next = model.updateCell('first', { content: 'after' });

    expect(model.cellById('first')?.content).toBe('before');
    expect(next.cellById('first')?.content).toBe('after');
  });

  it('inserts and moves cells without mutating the original document', () => {
    const model = EasyNotebookDocumentModel.empty({
      cells: [
        createNotebookCell('markdown', { id: 'a', content: 'a' }),
        createNotebookCell('code', { id: 'b', content: 'b' }),
      ],
    });

    const inserted = model.insertCell(createNotebookCell('raw', { id: 'c', content: 'c' }), 1);
    const moved = inserted.moveCell(2, 0);

    expect(model.cells.map((cell) => cell.id)).toEqual(['a', 'b']);
    expect(inserted.cells.map((cell) => cell.id)).toEqual(['a', 'c', 'b']);
    expect(moved.cells.map((cell) => cell.id)).toEqual(['b', 'a', 'c']);
  });

  it('reduces execution output changes for external reducers', () => {
    const notebook = EasyNotebookDocumentModel.empty({
      cells: [createNotebookCell('code', { id: 'code-1', content: '1 + 1' })],
    }).toJSON();

    const next = reduceEasyNotebookDocument(notebook, {
      type: 'set_outputs',
      cellId: 'code-1',
      outputs: [{ type: 'text', content: '2' }],
    });

    expect(notebook.cells[0].outputs).toEqual([]);
    expect(next.cells[0].outputs).toEqual([{ type: 'text', content: '2' }]);
  });
});
