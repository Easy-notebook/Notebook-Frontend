import { describe, it, expect } from 'vitest';
import { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { NotebookEditorCore, ChangeEvent } from '../NotebookEditorCore';
import { NotebookTransaction } from '../NotebookTransaction';
import { minimalSchema as schema } from '../schema.minimal';

function notebook(cellId: string, text: string): PMNode {
  return schema.node('notebook', null, [
    schema.node('markdownBlock', { cellId }, text ? schema.text(text) : undefined),
  ]);
}

describe('NotebookEditorCore — change classification', () => {
  it('classifies an in-cell text edit as "content"', () => {
    const core = new NotebookEditorCore({ initialDoc: notebook('a', 'hello') });
    const events: ChangeEvent[] = [];
    core.on('change', (e) => events.push(e));

    // Insert text inside the first markdownBlock (content starts at pos 1).
    const tr = core.state.tr.insertText('X', 1);
    core.dispatch(new NotebookTransaction(tr));

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('content');
    expect(events[0].doc.cells[0].text).toBe('Xhello');
  });

  it('classifies adding a cell as "structural"', () => {
    const core = new NotebookEditorCore({ initialDoc: notebook('a', 'hello') });
    const events: ChangeEvent[] = [];
    core.on('change', (e) => events.push(e));

    const raw = schema.node('rawBlock', { cellId: 'b' }, schema.text('code'));
    // Insert a new cell at the very end of the doc.
    const tr = core.state.tr.insert(core.state.doc.content.size, raw);
    core.dispatch(new NotebookTransaction(tr));

    expect(events[0].kind).toBe('structural');
    expect(events[0].doc.cellCount).toBe(2);
  });

  it('classifies a pure selection change as "selection"', () => {
    const core = new NotebookEditorCore({ initialDoc: notebook('a', 'hello') });
    const events: ChangeEvent[] = [];
    core.on('change', (e) => events.push(e));

    // Move the cursor without touching the document (pos 1 -> 3, both inside the cell).
    const tr = core.state.tr.setSelection(TextSelection.create(core.state.doc, 3));
    core.dispatch(new NotebookTransaction(tr));

    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('selection');
  });
});

describe('NotebookEditorCore — external sync echo guard (no timers)', () => {
  it('marks applyExternal transactions as fromExternal, user edits as not', () => {
    const core = new NotebookEditorCore({ initialDoc: notebook('a', 'hello') });
    const events: ChangeEvent[] = [];
    core.on('change', (e) => events.push(e));

    core.dispatch(new NotebookTransaction(core.state.tr.insertText('!', 1)));
    expect(events.at(-1)!.fromExternal).toBe(false);

    core.applyExternal(notebook('a', 'world'));
    expect(events.at(-1)!.fromExternal).toBe(true);
    expect(events.at(-1)!.doc.cells[0].text).toBe('world');
  });

  it('does NOT echo-loop when a listener mirrors changes back via applyExternal', () => {
    const core = new NotebookEditorCore({ initialDoc: notebook('a', 'hello') });
    let invocations = 0;

    // Simulate the adapter: on any *local* change, write back to the "store"
    // by calling applyExternal. The external flag must stop the recursion.
    core.on('change', (e) => {
      invocations++;
      if (!e.fromExternal) {
        core.applyExternal(notebook('a', e.doc.cells[0].text + '*'));
      }
    });

    core.dispatch(new NotebookTransaction(core.state.tr.insertText('Z', 1)));

    // 1 local change -> 1 external write-back -> stop. Exactly 2 invocations.
    expect(invocations).toBe(2);
  });
});
