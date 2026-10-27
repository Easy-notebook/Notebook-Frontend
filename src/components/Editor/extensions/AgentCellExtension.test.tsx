import { it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { getTipTapExtensions } from '../TipTap/config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from '../utils/cellConverters';
import { reconcileCells } from '../TipTap/model/reconcileCells';
import { synchronizeDocument } from '../TipTap/model/documentSync';
import { CellModel, type Cell } from '@Store/models/cell';
import { newAgentCellData } from '@Services/agent-cell/protocol';
import { NotebookSourceDocument } from '../model/NotebookSourceDocument';

it('preserves an agent conversation through projection, synchronization and persistence', () => {
  const data = newAgentCellData();
  data.turns.push({
    id: 'turn',
    prompt: 'Question',
    answer: 'Answer',
    actions: [],
    status: 'completed',
  });
  const cells: Cell[] = [
    { id: 'title', type: 'markdown', content: '# Notebook' },
    { id: 'agent', type: 'agent', content: '', metadata: { agent: data } },
  ];
  const editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: convertCellsToHtml(cells),
  });
  try {
    const projected = reconcileCells(convertEditorStateToCells(editor), cells);
    expect(projected[1]).toBe(cells[1]);
    expect(editor.state.doc.child(1).type.name).toBe('agentCell');
    const saved = CellModel.fromJSON(JSON.parse(JSON.stringify(projected[1]))).toJSON();
    expect(saved.metadata?.agent.turns[0].answer).toBe('Answer');
    expect(synchronizeDocument(editor, cells)).toBe(false);
    const source = new NotebookSourceDocument(cells);
    expect(NotebookSourceDocument.restore(source.checkpoint()).source).toBe(source.source);
  } finally {
    editor.destroy();
  }
});

it('inserts as a top-level cell even when the cursor is inside Markdown', () => {
  const cells: Cell[] = [
    { id: 'title', type: 'markdown', content: '# Notebook' },
    { id: 'notes', type: 'markdown', content: 'Keep this paragraph' },
  ];
  const editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: convertCellsToHtml(cells),
  });
  try {
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 3);
    expect(editor.commands.insertAgentCell('new-agent')).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('markdownCell');
    expect(editor.state.doc.child(2).type.name).toBe('agentCell');
    expect(convertEditorStateToCells(editor).map((cell) => cell.id)).toEqual([
      'title',
      'notes',
      'new-agent',
    ]);
  } finally {
    editor.destroy();
  }
});
