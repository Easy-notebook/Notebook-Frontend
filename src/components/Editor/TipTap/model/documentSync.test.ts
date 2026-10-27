import { describe, expect, it, vi } from 'vitest';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { Editor } from '@tiptap/core';
import { AllSelection, TextSelection, NodeSelection } from '@tiptap/pm/state';
import type { Cell } from '@Store/models';
import { getTipTapExtensions } from '../config/extensions';
import { convertCellsToHtml, convertEditorStateToCells } from '@Editor/utils/cellConverters';
import { synchronizeDocument } from './documentSync';

const markdown = (id: string, content: string): Cell => ({
  id,
  type: 'markdown',
  content,
  outputs: [],
});

describe('document synchronization', () => {
  it('updates phase markup and all heading levels without reparsing unchanged Markdown', () => {
    const title = markdown('title', '# Notebook');
    const cell = { ...markdown('body', '## Phase\n\n### Step\n\nUnchanged body'), phaseId: 'old' };
    const plain = { ...markdown('plain', 'No headings'), phaseId: 'old' };
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml([title, cell, plain]),
    });
    const parse = vi.spyOn(ProseMirrorDOMParser.prototype, 'parseSlice');
    try {
      const paragraph = editor.state.doc.child(1).lastChild;
      const plainContent = editor.state.doc.child(2).content;
      let paragraphStart = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node === paragraph) paragraphStart = pos + 1;
      });
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, paragraphStart + 9, paragraphStart + 2)
        )
      );
      synchronizeDocument(editor, [
        title,
        { ...cell, phaseId: 'new' },
        { ...plain, phaseId: 'new' },
      ]);
      const block = editor.state.doc.child(1);
      expect(block.attrs.phaseId).toBe('new');
      expect(block.child(0).attrs.id).toBe('new');
      expect(block.child(1).attrs.id).toBe('new--step');
      expect(block.lastChild).toBe(paragraph);
      expect(editor.state.doc.child(2).attrs.phaseId).toBe('new');
      expect(editor.state.doc.child(2).content).toBe(plainContent);
      expect(editor.state.selection.anchor).toBe(paragraphStart + 9);
      expect(editor.state.selection.head).toBe(paragraphStart + 2);
      expect(editor.state.selection.$head.parent).toBe(paragraph);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
      editor.destroy();
    }
  });
  it.each([
    '### **Bold** &amp; [link](https://example.test)',
    '> ### Quoted `code`\n>\n> #### Nested',
    '- Item\n\n  ### List heading\n\n  #### Child',
  ])('matches whole-document heading projection for rich source: %s', (source) => {
    const title = markdown('title', '# Notebook');
    const cells = [
      title,
      { ...markdown('one', source), phaseId: 'phase' },
      { ...markdown('two', source), phaseId: 'phase' },
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml([title]),
    });
    const full = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const ids = (instance: Editor) => {
      const result: string[] = [];
      instance.state.doc.descendants((node) => {
        if (node.type.name === 'heading') result.push(node.attrs.id);
      });
      return result;
    };
    try {
      synchronizeDocument(editor, cells);
      expect(ids(editor)).toEqual(ids(full));
      expect(ids(editor).length).toBeGreaterThanOrEqual(2);
    } finally {
      editor.destroy();
      full.destroy();
    }
  });
  it('maintains phase heading occurrences across incremental cell projection and reordering', () => {
    const title = markdown('title', '# Notebook');
    const first = { ...markdown('first', '### Repeat'), phaseId: 'phase' };
    const second = { ...markdown('second', '### repeat!'), phaseId: 'phase' };
    const plain = markdown('plain', 'Untouched paragraph');
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml([title, plain]),
    });
    const ids = () => {
      const result: string[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'heading') result.push(node.attrs.id);
      });
      return result;
    };
    try {
      const untouched = editor.state.doc.child(1);
      synchronizeDocument(editor, [title, first, second, plain]);
      expect(ids()).toEqual(['phase--repeat', 'phase--repeat-2']);
      expect(editor.state.doc.child(3)).toBe(untouched);
      synchronizeDocument(editor, [title, second, first, plain]);
      expect(ids()).toEqual(['phase--repeat', 'phase--repeat-2']);
      expect(editor.state.doc.child(1).attrs.cellId).toBe('second');
      synchronizeDocument(editor, [title, { ...second, content: '### Renamed' }, first, plain]);
      expect(ids()).toEqual(['phase--renamed', 'phase--repeat']);
      expect(editor.state.doc.child(3)).toBe(untouched);
      synchronizeDocument(editor, [title, second, { ...first, phaseId: 'other' }, plain]);
      expect(ids()).toEqual(['phase--repeat', 'other--repeat']);
      expect(editor.state.doc.child(2).attrs.phaseId).toBe('other');
      synchronizeDocument(editor, [title, second, { ...first, phaseId: undefined }, plain]);
      expect(ids()).toEqual(['phase--repeat', 'first--repeat']);
      expect(editor.state.doc.child(3)).toBe(untouched);
    } finally {
      editor.destroy();
    }
  });
  it('retains whole-document selection when external changes replace its first block', () => {
    const cells = [markdown('title', '# Notebook'), markdown('body', 'Text')];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    try {
      editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
      expect(
        synchronizeDocument(editor, [
          markdown('new-title', '# Renamed'),
          cells[1],
          markdown('new', 'More'),
        ])
      ).toBe(true);
      expect(editor.state.selection).toBeInstanceOf(AllSelection);
      expect(editor.state.selection.from).toBe(0);
      expect(editor.state.selection.to).toBe(editor.state.doc.content.size);
    } finally {
      editor.destroy();
    }
  });
  it('does not restore a deleted atom selection onto an unrelated cell', () => {
    const cells: Cell[] = [
      markdown('title', '# Notebook'),
      { id: 'picture', type: 'image', content: '![caption](https://example.test/image.png)' },
      markdown('last', 'Text'),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    try {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, editor.state.doc.child(0).nodeSize)
        )
      );
      expect(synchronizeDocument(editor, [cells[0], cells[2]])).toBe(true);
      expect(editor.state.selection).toBeInstanceOf(TextSelection);
      expect(editor.state.selection.$anchor.node(1).attrs.cellId).toBe('last');
    } finally {
      editor.destroy();
    }
  });
  it('keeps a moved atom selected as a node rather than selecting nearby text', () => {
    const cells: Cell[] = [
      markdown('title', '# Notebook'),
      markdown('first', 'Text'),
      { id: 'picture', type: 'image', content: '![caption](https://example.test/image.png)' },
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    try {
      const position = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize;
      editor.view.dispatch(
        editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position))
      );
      expect(synchronizeDocument(editor, [cells[0], cells[2], cells[1]])).toBe(true);
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect((editor.state.selection as NodeSelection).node.attrs.cellId).toBe('picture');
    } finally {
      editor.destroy();
    }
  });
  it.each([
    { content: 'XXOther', offset: 4 },
    { content: 'her', offset: 0 },
    { content: '', offset: 0 },
  ])('maps selection through a text change in a moved cell: %o', ({ content, offset }) => {
    const cells = [
      markdown('title', '# Notebook'),
      markdown('first', 'One'),
      markdown('second', 'Other'),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    try {
      const position = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 4;
      editor.commands.setTextSelection(position);
      expect(synchronizeDocument(editor, [cells[0], markdown('second', content), cells[1]])).toBe(
        true
      );
      expect(editor.state.selection.$anchor.node(1).attrs.cellId).toBe('second');
      expect(editor.state.selection.$anchor.parentOffset).toBe(offset);
    } finally {
      editor.destroy();
    }
  });
  it.each([false, true])(
    'retains cross-cell selection ownership after a reorder (backward: %s)',
    (backward) => {
      const cells = [
        markdown('title', '# Notebook'),
        markdown('first', 'One two'),
        markdown('second', 'Other'),
      ];
      const editor = new Editor({
        extensions: getTipTapExtensions('Untitled'),
        content: convertCellsToHtml(cells),
      });
      try {
        const first = editor.state.doc.child(0).nodeSize + 3;
        const second = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 4;
        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.create(
              editor.state.doc,
              backward ? second : first,
              backward ? first : second
            )
          )
        );
        expect(synchronizeDocument(editor, [cells[0], cells[2], cells[1]])).toBe(true);
        const { $anchor, $head } = editor.state.selection;
        expect([$anchor.node(1).attrs.cellId, $anchor.parentOffset]).toEqual(
          backward ? ['second', 2] : ['first', 1]
        );
        expect([$head.node(1).attrs.cellId, $head.parentOffset]).toEqual(
          backward ? ['first', 1] : ['second', 2]
        );
      } finally {
        editor.destroy();
      }
    }
  );
  it.each([
    { backward: false, cell: 1 },
    { backward: true, cell: 1 },
    { backward: false, cell: 2 },
    { backward: true, cell: 2 },
  ])('preserves both endpoints after reordering: %o', ({ backward, cell }) => {
    const cells = [
      markdown('title', '# Notebook'),
      markdown('first', 'One two'),
      markdown('second', 'Other'),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    try {
      const start =
        editor.state.doc.child(0).nodeSize +
        (cell === 2 ? editor.state.doc.child(1).nodeSize : 0) +
        2;
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(
            editor.state.doc,
            backward ? start + 3 : start,
            backward ? start : start + 3
          )
        )
      );
      expect(synchronizeDocument(editor, [cells[0], cells[2], cells[1]])).toBe(true);
      expect(editor.state.selection.$anchor.parentOffset).toBe(backward ? 3 : 0);
      expect(editor.state.selection.$head.parentOffset).toBe(backward ? 0 : 3);
      expect(editor.state.selection.$anchor.node(1).attrs.cellId).toBe(cells[cell].id);
      expect(editor.state.selection.$head.node(1).attrs.cellId).toBe(cells[cell].id);
    } finally {
      editor.destroy();
    }
  });
  it('keeps untouched middle cells outside the replacement maps for separated external edits', () => {
    const cells = [
      markdown('title', '# Notebook'),
      markdown('a', 'First'),
      markdown('middle', 'Keep selection'),
      markdown('b', 'Last'),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    try {
      const position = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 3;
      editor.commands.setTextSelection(position);
      const middle = editor.state.doc.child(2);
      const dispatch = vi.spyOn(editor.view, 'dispatch');
      expect(
        synchronizeDocument(editor, [
          cells[0],
          markdown('a', 'Changed first'),
          cells[2],
          markdown('b', 'Changed last'),
        ])
      ).toBe(true);
      const transaction = dispatch.mock.calls[0][0];
      expect(transaction.steps).toHaveLength(2);
      expect(transaction.mapping.mapResult(position).deleted).toBe(false);
      expect(editor.state.doc.child(2)).toBe(middle);
      expect(editor.state.selection.$from.parent.textContent).toBe('Keep selection');
      expect(editor.state.selection.$from.parentOffset).toBe(1);
    } finally {
      editor.destroy();
    }
  });
  it('does not allocate a parsing DOM container for an unchanged document', () => {
    const cells = [markdown('title', '# Notebook'), markdown('body', 'Text')];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const create = vi.spyOn(document, 'createElement');
    try {
      expect(synchronizeDocument(editor, cells)).toBe(false);
      expect(create).not.toHaveBeenCalled();
    } finally {
      create.mockRestore();
      editor.destroy();
    }
  });
  it.each(['raw', 'link', 'image'] as const)(
    'does not traverse business metadata for %s cells',
    (type) => {
      const cells: Cell[] = [
        markdown('title', '# Notebook'),
        {
          id: 'body',
          type,
          content:
            type === 'link'
              ? '[file](https://example.com/file)'
              : type === 'image'
                ? '![image](https://example.com/image.png)'
                : 'raw text',
        },
      ];
      const editor = new Editor({
        extensions: getTipTapExtensions('Untitled'),
        content: convertCellsToHtml(cells),
      });
      const parse = vi.spyOn(ProseMirrorDOMParser.prototype, 'parseSlice');
      const serialize = vi.fn(() => {
        throw new Error('Business metadata was traversed');
      });
      try {
        const original = editor.state.doc;
        expect(
          synchronizeDocument(editor, [
            cells[0],
            { ...cells[1], metadata: { largePayload: { toJSON: serialize } } },
          ])
        ).toBe(false);
        expect(serialize).not.toHaveBeenCalled();
        expect(parse).not.toHaveBeenCalled();
        expect(editor.state.doc).toBe(original);
      } finally {
        parse.mockRestore();
        editor.destroy();
      }
    }
  );
  it('updates thinking presentation fields and restores defaults when they are removed', () => {
    const cells: Cell[] = [
      markdown('title', '# Notebook'),
      { id: 'thinking', type: 'thinking', content: '' },
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    try {
      const changed = {
        ...cells[1],
        agentName: 'Reviewer',
        customText: 'Checking',
        textArray: ['one', 'two'],
        useWorkflowThinking: true,
      };
      expect(synchronizeDocument(editor, [cells[0], changed])).toBe(true);
      expect(editor.state.doc.child(1).attrs).toMatchObject({
        agentName: 'Reviewer',
        customText: 'Checking',
        textArray: ['one', 'two'],
        useWorkflowThinking: true,
      });
      expect(
        synchronizeDocument(editor, [
          cells[0],
          { ...changed, textArray: ['one', 'two'], metadata: { irrelevant: true } },
        ])
      ).toBe(false);
      expect(synchronizeDocument(editor, cells)).toBe(true);
      expect(editor.state.doc.child(1).attrs).toMatchObject({
        agentName: 'AI',
        customText: null,
        textArray: [],
        useWorkflowThinking: false,
      });
      const parse = vi.spyOn(ProseMirrorDOMParser.prototype, 'parseSlice');
      try {
        expect(synchronizeDocument(editor, cells)).toBe(false);
        expect(parse).not.toHaveBeenCalled();
      } finally {
        parse.mockRestore();
      }
    } finally {
      editor.destroy();
    }
  });
  it('does not parse or stringify business metadata in a 1000-cell Markdown notebook', () => {
    const cells = [
      markdown('title', '# Notebook'),
      ...Array.from({ length: 1000 }, (_, i) => ({
        ...markdown(`body-${i}`, `Paragraph ${i}`),
        metadata: { executionCount: i, custom: { tags: ['a', 'b'] } },
      })),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const parse = vi.spyOn(ProseMirrorDOMParser.prototype, 'parseSlice');
    const serialize = vi.fn(() => {
      throw new Error('Business payload must not be serialized');
    });
    try {
      const next = cells.map((cell) => ({
        ...cell,
        metadata: { ...cell.metadata, custom: { toJSON: serialize } },
      }));
      const original = editor.state.doc;
      expect(synchronizeDocument(editor, next)).toBe(false);
      expect(parse).not.toHaveBeenCalled();
      expect(serialize).not.toHaveBeenCalled();
      expect(editor.state.doc).toBe(original);
    } finally {
      parse.mockRestore();
      editor.destroy();
    }
  }, 20000);
  it('updates phase-owned heading IDs when text is unchanged', () => {
    const cells = [
      markdown('title', '# Notebook'),
      { ...markdown('body', '## Heading'), phaseId: 'old-phase' },
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    try {
      expect(editor.state.doc.child(1).attrs.phaseId).toBe('old-phase');
      expect(synchronizeDocument(editor, [cells[0], { ...cells[1], phaseId: 'new-phase' }])).toBe(
        true
      );
      expect(editor.state.doc.child(1).attrs.phaseId).toBe('new-phase');
      expect(editor.state.doc.child(1).firstChild?.attrs.id).toBe('new-phase');
      expect(convertEditorStateToCells(editor)[1].phaseId).toBe('new-phase');
    } finally {
      editor.destroy();
    }
  });
  it('updates source origin without reparsing unrelated source metadata', () => {
    const cells = [
      markdown('title', '# Notebook'),
      {
        ...markdown('body', '```python\nprint(1)\n```'),
        metadata: { editorMode: 'source', sourceCellType: 'code', custom: 1 },
      },
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const parse = vi.spyOn(ProseMirrorDOMParser.prototype, 'parseSlice');
    try {
      expect(
        synchronizeDocument(editor, [
          cells[0],
          { ...cells[1], metadata: { ...cells[1].metadata, custom: 2 } },
        ])
      ).toBe(false);
      expect(parse).not.toHaveBeenCalled();
      expect(
        synchronizeDocument(editor, [
          cells[0],
          { ...cells[1], metadata: { ...cells[1].metadata, sourceCellType: 'hybrid' } },
        ])
      ).toBe(true);
      expect(parse).toHaveBeenCalledTimes(1);
      expect(editor.state.doc.child(1).attrs.sourceCellType).toBe('hybrid');
    } finally {
      parse.mockRestore();
      editor.destroy();
    }
  });
  it.each(['## Heading', '- one\n- two', '```mermaid\ngraph TD; A-->B\n```', ''])(
    'preserves cell boundaries when externally changing the block structure: %s',
    (content) => {
      const cells = [
        markdown('title', '# Notebook'),
        markdown('body', 'Original'),
        markdown('after', 'Untouched'),
      ];
      const editor = new Editor({
        extensions: getTipTapExtensions('Untitled'),
        content: convertCellsToHtml(cells),
      });
      try {
        synchronizeDocument(editor, [cells[0], markdown('body', content), cells[2]]);
        const projected = convertEditorStateToCells(editor);
        expect(projected.map((cell) => cell.id)).toEqual(['title', 'body', 'after']);
        expect(projected[2].content).toBe('Untouched');
        expect(editor.state.doc.child(1).type.name).toBe('markdownCell');
      } finally {
        editor.destroy();
      }
    }
  );
  it('parses only one changed cell in a 1000-cell notebook', () => {
    const cells = [
      markdown('title', '# Notebook'),
      ...Array.from({ length: 1000 }, (_, i) => markdown(`body-${i}`, `Paragraph ${i}`)),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const spy = vi.spyOn(ProseMirrorDOMParser.prototype, 'parseSlice');
    try {
      const next = [...cells];
      next[501] = { ...next[501], content: 'Changed paragraph' };
      synchronizeDocument(editor, next);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(convertEditorStateToCells(editor)[501].content).toBe('Changed paragraph');
      spy.mockClear();
      synchronizeDocument(editor, next);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      editor.destroy();
    }
  }, 20000);

  it('maps a non-empty text selection through an external insertion in the same cell', () => {
    const cells = [markdown('title', '# Notebook'), markdown('body', 'Hello world')];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const start = editor.state.doc.firstChild!.nodeSize + 2;
    editor.commands.setTextSelection({ from: start + 6, to: start + 11 });
    synchronizeDocument(editor, [cells[0], markdown('body', 'Hello brave world')]);
    expect(
      editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
    ).toBe('world');
    expect(editor.state.selection.empty).toBe(false);
    editor.destroy();
  });
  it('preserves markdown cell IDs through document conversion', () => {
    const cells = [markdown('title', '# Notebook'), markdown('body', 'A paragraph')];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    expect(convertEditorStateToCells(editor).map((cell) => cell.id)).toEqual(['title', 'body']);
    editor.destroy();
  });

  it('replaces only changed top-level blocks for an external update', () => {
    const cells = [
      markdown('title', '# Notebook'),
      markdown('first', 'One'),
      markdown('second', 'Two'),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    const unchanged = editor.state.doc.child(2);
    expect(synchronizeDocument(editor, [cells[0], markdown('first', 'Updated'), cells[2]])).toBe(
      true
    );
    expect(editor.state.doc.child(2)).toBe(unchanged);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject({ id: 'first', content: 'Updated' });
    editor.destroy();
  });

  it('keeps the caret in the same Markdown cell after an external reorder', () => {
    const cells = [
      markdown('title', '# Notebook'),
      markdown('first', 'One'),
      markdown('second', 'Two'),
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize + 2);
    expect(synchronizeDocument(editor, [cells[0], cells[2], cells[1]])).toBe(true);
    expect(convertEditorStateToCells(editor).map((cell) => cell.id)).toEqual([
      'title',
      'second',
      'first',
    ]);
    const index = editor.state.doc.resolve(editor.state.selection.anchor).index(0);
    expect(editor.state.doc.child(index).attrs.cellId).toBe('first');
    editor.destroy();
  });

  it('keeps local Markdown edits in the editor undo history', () => {
    const cells = [markdown('title', '# Notebook'), markdown('body', 'One')];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    editor.commands.insertContentAt(editor.state.doc.child(0).nodeSize + 2, 'X');
    expect(convertEditorStateToCells(editor)[1].content).toBe('XOne');
    expect(editor.commands.undo()).toBe(true);
    expect(convertEditorStateToCells(editor)[1].content).toBe('One');
    editor.destroy();
  });

  it('retains the hybrid-cell type across HTML and document boundaries', () => {
    const cells: Cell[] = [
      markdown('title', '# Notebook'),
      {
        id: 'hybrid',
        type: 'hybrid',
        content: 'print(1)',
        outputs: [],
        language: 'python',
      },
    ];
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    expect(editor.state.doc.child(1).attrs.originalType).toBe('hybrid');
    expect(convertEditorStateToCells(editor)[1]).toMatchObject({ id: 'hybrid', type: 'hybrid' });
    editor.destroy();
  });

  it.each(['graph TD\nA-->B', 'this is not valid Mermaid syntax'])(
    'preserves Mermaid source in a Markdown cell: %s',
    (source) => {
      const content = `Before\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\nAfter`;
      const cells = [markdown('title', '# Notebook'), markdown('diagram', content)];
      const editor = new Editor({
        extensions: getTipTapExtensions('Untitled'),
        content: convertCellsToHtml(cells),
      });
      expect(editor.state.doc.child(1).child(1).type.name).toBe('mermaidBlock');
      expect(convertEditorStateToCells(editor)[1]).toMatchObject({ id: 'diagram', content });
      editor.destroy();
    }
  );

  it.each([
    { id: 'code', type: 'code', content: 'print(1)', language: 'python', outputs: [] },
    { id: 'image', type: 'image', content: '![alt](https://example.com/image.png)', outputs: [] },
    { id: 'thinking', type: 'thinking', content: '', outputs: [] },
    { id: 'raw', type: 'raw', content: '<not markdown>', outputs: [] },
    { id: 'link', type: 'link', content: '[file](https://example.com/file.txt)', outputs: [] },
  ] as Cell[])('keeps $type cell identity and content through a document round trip', (cell) => {
    const editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml([markdown('title', '# Notebook'), cell]),
    });
    expect(convertEditorStateToCells(editor)[1]).toMatchObject({
      id: cell.id,
      type: cell.type,
      content: cell.content,
    });
    editor.destroy();
  });
});
