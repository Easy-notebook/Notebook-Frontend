import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Editor } from '@tiptap/core';
import type { Cell } from '@Store/models';
import { getTipTapExtensions } from '../config/extensions';
import { convertCellsToHtml, convertEditorStateToCells, serializeMarkdownBlock } from '../../utils/cellConverters';
import {
  breakCodeBlockFence,
  breakNestedCodeFence,
  editSelectedCellSource,
  editCodeBlockSource,
  previewMarkdownSource,
} from './sourceCellTransitions';
import { reconcileCells } from './reconcileCells';
import { EXTERNAL_CELL_SYNC, synchronizeDocument } from './documentSync';
import { handleSourceInputHistory } from '../../utils/sourceInputHistory';
import type { KeyboardEvent } from 'react';

let editor: Editor;
const markdown = (id: string, content: string): Cell => ({
  id,
  type: 'markdown',
  content,
  outputs: [],
});
function create(cell: Cell) {
  editor = new Editor({
    extensions: getTipTapExtensions('Untitled'),
    content: convertCellsToHtml([
      markdown('title', '# Notebook'),
      cell,
      markdown('after', 'Untouched'),
    ]),
  });
  return editor.state.doc.firstChild!.nodeSize;
}
afterEach(() => editor?.destroy());

describe('source cell transitions', () => {
  it('does not add trailing spaces to empty quoted code lines', () => {
    expect(serializeMarkdownBlock({
      type: 'blockquote', content: [{ type: 'fencedCodeBlock',
        attrs: { language: 'python', source: '```python\n\n```' }, content: [],
      }],
    })).toBe('> ```python\n>\n> ```');
  });
  it.each([
    '```python\n\n```',
    '~~~python\n\n~~~',
    '````c++ custom\nvalue\n`````',
    '~~~~unknown-language\n中文🐍\n~~~~~',
    '> ```python\n>\n> ```',
    '- before\n\n  ~~~python\n\n  ~~~',
  ])('breaks and repairs edge-case nested fences without losing content: %s', source => {
    const pos = create(markdown('edge-fence', 'Before\n\n' + source + '\n\nAfter'));
    let codePos = -1;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'fencedCodeBlock') codePos = position;
    });
    expect(codePos).toBeGreaterThan(pos);
    const original = editor.state.doc;
    const originalCells = convertEditorStateToCells(editor);
    editor.commands.setTextSelection(codePos + 1);
    expect(breakNestedCodeFence(editor)).toBe(true);
    const broken = editor.state.doc.nodeAt(pos)!;
    expect(broken.attrs.cellId).toBe('edge-fence');
    const delimiter = source.includes('~~~') ? '~' : '`';
    const caret = broken.attrs.caret as number;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, {
      ...broken.attrs,
      source: broken.attrs.source.slice(0, caret) + delimiter + broken.attrs.source.slice(caret),
    }));
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(convertEditorStateToCells(editor)).toEqual(originalCells);
    expect(editor.state.doc.firstChild).toBe(original.firstChild);
    expect(editor.state.doc.lastChild).toBe(original.lastChild);
  });
  it('does not break a nested fence while IME composition owns the code block', () => {
    const pos = create(markdown('composing', 'Before\n\n```python\nvalue\n```'));
    const start = pos + 2 + editor.state.doc.nodeAt(pos)!.firstChild!.nodeSize;
    editor.commands.setTextSelection(start);
    const before = editor.state.doc;
    const composition = vi.spyOn(editor.view, 'composing', 'get').mockReturnValue(true);
    try {
      expect(breakNestedCodeFence(editor)).toBe(false);
      expect(editor.state.doc).toBe(before);
    } finally {
      composition.mockRestore();
    }
    expect(breakNestedCodeFence(editor)).toBe(true);
  });
  it.each(['fencedCodeBlock', 'mermaidBlock'])(
    'retains original %s wrapper formatting after editing its body', type => {
      const language = type === 'mermaidBlock' ? 'mermaid' : 'python';
      const source = `  ~~~~${language} custom  \r\nold\r\n ~~~~~  \t`;
      const node = {
        type, attrs: { source, language, code: 'new' },
        content: [{ type: 'text', text: 'new' }],
      };
      expect(serializeMarkdownBlock(node)).toBe(source.replace('old', 'new'));
    }
  );
  it('undoes source indentation independently from preceding and following typing', () => {
    const pos = create({ ...markdown('indent-history', 'a'), metadata: { editorMode: 'source' } });
    const update = (source: string) =>
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(pos, undefined, {
          ...editor.state.doc.nodeAt(pos)!.attrs,
          source,
        })
      );
    update('ab');
    const input = document.createElement('textarea');
    input.value = 'ab';
    input.setSelectionRange(2, 2);
    handleSourceInputHistory(
      {
        key: ']',
        ctrlKey: true,
        currentTarget: input,
        nativeEvent: {},
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent<HTMLTextAreaElement>,
      editor,
      update
    );
    expect(editor.state.doc.nodeAt(pos)!.attrs.source).toBe('  ab');
    update('  abc');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.source).toBe('  ab');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.source).toBe('ab');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.source).toBe('a');
  });
  it.each(['%', '%E0%A4%A', '%ZZ'])(
    'loads malformed source encoding %s without losing literal text',
    (source) => {
      create(markdown('body', 'Body'));
      expect(() =>
        editor.commands.setContent(
          `<h1>Notebook</h1><div data-type="markdown-source-cell" data-cell-id="literal" data-source="${source}"></div><div data-type="mermaid-block" data-code="${source}" data-source="${source}"></div><pre data-type="fenced-code-block" data-source="${source}"><code>safe</code></pre>`
        )
      ).not.toThrow();
      const nodes: ProseMirrorNode[] = [];
      editor.state.doc.descendants((node) => {
        if (['markdownSourceCell', 'mermaidBlock', 'fencedCodeBlock'].includes(node.type.name))
          nodes.push(node);
      });
      expect(nodes).toHaveLength(3);
      for (const node of nodes) expect(node.attrs.source).toBe(source);
      expect(nodes.find((node) => node.type.name === 'mermaidBlock')!.attrs.code).toBe(source);
      const html = editor.getHTML();
      editor.commands.setContent(html);
      editor.state.doc.descendants((node) => {
        if (['markdownSourceCell', 'mermaidBlock', 'fencedCodeBlock'].includes(node.type.name))
          expect(node.attrs.source).toBe(source);
      });
    }
  );
  it.each(['code', 'hybrid'] as const)(
    'opens intact %s source using latest content and restores its identity',
    (type) => {
      const cell: Cell = {
        id: 'source-code',
        type,
        language: 'python',
        content: 'old',
        outputs: [],
      };
      const pos = create(cell);
      const latest: Cell = {
        ...cell,
        content: '```\nprint(2)',
        outputs: [{ type: 'text', content: '2' }],
      };
      expect(editCodeBlockSource(editor, pos, latest)).toBe(true);
      const sourceNode = editor.state.doc.nodeAt(pos)!;
      expect(sourceNode.attrs.source).toBe(type === 'hybrid' ? latest.content : '````python\n```\nprint(2)\n````');
      expect(sourceNode.attrs.caret).toBe(type === 'hybrid' ? 0 : '````python\n'.length);
      const stored = reconcileCells(convertEditorStateToCells(editor), [
        markdown('title', '# Notebook'),
        latest,
        markdown('after', 'Untouched'),
      ]);
      expect(editor.commands.undo()).toBe(true);
      expect(editor.state.doc.nodeAt(pos)!.attrs.code).toBe(encodeURIComponent(latest.content));
      expect(editor.commands.redo()).toBe(true);
      expect(previewMarkdownSource(editor, pos)).toBe(true);
      expect(reconcileCells(convertEditorStateToCells(editor), stored)[1]).toMatchObject(latest);
    }
  );
  it('opens and breaks the actual hybrid fence while retaining surrounding prose', () => {
    const cell: Cell = { id: 'mixed-hybrid', type: 'hybrid', content: 'Before\n\n~~~python\n  x\n~~~\n\nAfter' };
    const pos = create(cell);
    expect(editCodeBlockSource(editor, pos, cell)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.source).toBe(cell.content);
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.code).toBe(encodeURIComponent(cell.content));
    expect(breakCodeBlockFence(editor, pos, cell)).toBe(true);
    const node = editor.state.doc.nodeAt(pos)!;
    expect(node.attrs.source).toBe(cell.content.replace('~~~python', '~~python'));
    expect(node.attrs.caret).toBe('Before\n\n~~'.length);
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.originalType).toBe('hybrid');
    expect(decodeURIComponent(editor.state.doc.nodeAt(pos)!.attrs.code)).toBe(cell.content.replace('~~~python', '~~python'));
  });
  it('preserves hybrid language metadata across mixed-source preview', () => {
    const cell: Cell = { id: 'hybrid-language', type: 'hybrid', language: 'typescript',
      content: 'Before\n```typescript\nconst x = 1\n```\nAfter' };
    const pos = create(cell);
    expect(editCodeBlockSource(editor, pos, cell)).toBe(true);
    const sourceCells = reconcileCells(convertEditorStateToCells(editor), [
      markdown('title', '# Notebook'), cell, markdown('after', 'Untouched'),
    ]);
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const restored = reconcileCells(convertEditorStateToCells(editor), sourceCells);
    expect(editor.state.doc.nodeAt(pos)!.attrs.language).toBe('typescript');
    expect(restored[1]).toMatchObject({ type: 'hybrid', language: 'typescript', content: cell.content });
  });
  it('breaks the editable hybrid code fence rather than a preceding Mermaid diagram', () => {
    const diagram = '```mermaid\ngraph TD; A-->B\n```';
    const cell: Cell = { id: 'diagram-first', type: 'hybrid', content: diagram + '\n\n```python\nx\n```' };
    const pos = create(cell);
    expect(breakCodeBlockFence(editor, pos, cell)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.source).toBe(diagram + '\n\n``python\nx\n```');
  });
  it('rejects a stale fence-break callback without changing the cell at its former position', () => {
    const current: Cell = {
      id: 'current',
      type: 'code',
      language: 'python',
      content: 'print(2)',
      outputs: [],
    };
    const pos = create(current);
    const before = editor.state;
    const dispatch = vi.spyOn(editor.view, 'dispatch');
    expect(breakCodeBlockFence(editor, pos, { ...current, id: 'moved', content: 'print(1)' })).toBe(
      false
    );
    expect(breakCodeBlockFence(editor, pos, { ...current, type: 'markdown' })).toBe(false);
    expect(editor.state).toBe(before);
    expect(dispatch).not.toHaveBeenCalled();
    dispatch.mockRestore();
    expect(breakCodeBlockFence(editor, pos, current)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.source).toContain('print(2)');
  });
  it.each([false, true])(
    'repairs a rich-table fence across undo and reload (nested list: %s)',
    (nested) => {
      const code =
        '<pre data-type="fenced-code-block" data-language="python"><code>print(1)</code></pre>';
      const pos = create(
        markdown(
          'nested-table-code',
          `<table><tr><td>${nested ? `<ul><li><p>before</p>${code}</li></ul>` : code}</td></tr></table>`
        )
      );
      let codePos = -1;
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === 'fencedCodeBlock') codePos = position;
      });
      expect(codePos).toBeGreaterThan(pos);
      editor.commands.setTextSelection(codePos + 1);
      expect(breakNestedCodeFence(editor)).toBe(true);
      const attrs = editor.state.doc.nodeAt(pos)!.attrs;
      expect(attrs.source.slice(attrs.caret - 2, attrs.caret)).toBe('``');
      const brokenSource = attrs.source;
      expect(editor.commands.undo()).toBe(true);
      expect(editor.state.doc.nodeAt(pos)!.type.name).toBe('markdownCell');
      expect(editor.commands.redo()).toBe(true);
      expect(editor.state.doc.nodeAt(pos)!.attrs.source).toBe(brokenSource);
      editor.commands.setContent(convertCellsToHtml(convertEditorStateToCells(editor)));
      const reloaded = editor.state.doc.nodeAt(pos)!;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(pos, undefined, {
          ...reloaded.attrs,
          source: brokenSource.slice(0, attrs.caret) + '`' + brokenSource.slice(attrs.caret),
        })
      );
      expect(previewMarkdownSource(editor, pos)).toBe(true);
      let restored: ProseMirrorNode | undefined;
      editor.state.doc.nodeAt(pos)!.descendants((node) => {
        if (node.type.name === 'fencedCodeBlock') restored = node;
      });
      expect(restored).toBeDefined();
      expect(restored!.textContent).toBe('print(1)');
      expect(restored!.attrs.language).toBe('python');
    }
  );
  it('preserves merged cells, paragraphs, widths and per-cell alignment through source and reload', () => {
    const pos = create(markdown('rich-table', '| A | B |\n| --- | --- |\n| x | y |'));
    const table = editor.state.doc.nodeAt(pos)!.firstChild!;
    const json = table.toJSON();
    json.content[0].content[0].attrs.colwidth = [120];
    json.content[0].content[1].attrs.colwidth = [180];
    json.content[1].content = [
      {
        type: 'tableCell',
        attrs: { colspan: 2, rowspan: 1, colwidth: [120, 180], textAlign: 'right' },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'first', marks: [{ type: 'bold' }] }],
          },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: 'second' }] },
          {
            type: 'mermaidBlock',
            attrs: { code: 'graph TD; A-->B', source: '```mermaid\ngraph TD; A-->B\n```' },
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }],
              },
            ],
          },
          {
            type: 'fencedCodeBlock',
            attrs: { language: 'python', source: '```python\na\n\nb\n```' },
            content: [{ type: 'text', text: 'a\n\nb' }],
          },
        ],
      },
    ];
    const original = editor.schema.nodeFromJSON(json);
    editor.view.dispatch(editor.state.tr.replaceWith(pos + 1, pos + 1 + table.nodeSize, original));
    editor.commands.setTextSelection(pos + 5);
    expect(editSelectedCellSource(editor)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.source).toContain('<table>');
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.firstChild!.toJSON()).toEqual(original.toJSON());
    editor.commands.setContent(convertCellsToHtml(convertEditorStateToCells(editor)));
    expect(editor.state.doc.child(1).firstChild!.eq(original)).toBe(true);
  });
  it.each(['a|b', 'a\\|b', 'a\\\\|b', '`tick` | <tag> &amp; $x$', '中文|值'])(
    'preserves table inline code without splitting columns: %s',
    (text) => {
      const pos = create(markdown('code-table', '| Code | Other |\n| --- | --- |\n| x | keep |'));
      const table = editor.state.doc.nodeAt(pos)!.firstChild!;
      const json = table.toJSON();
      json.content[1].content[0].content = [
        { type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'code' }] }] },
      ];
      const original = editor.schema.nodeFromJSON(json);
      editor.view.dispatch(
        editor.state.tr.replaceWith(pos + 1, pos + 1 + table.nodeSize, original)
      );
      editor.commands.setTextSelection(pos + 5);
      expect(editSelectedCellSource(editor)).toBe(true);
      expect(previewMarkdownSource(editor, pos)).toBe(true);
      expect(editor.state.doc.nodeAt(pos)!.firstChild!.eq(original)).toBe(true);
      const cells = convertEditorStateToCells(editor);
      editor.commands.setContent(convertCellsToHtml(cells));
      expect(editor.state.doc.child(1).firstChild!.eq(original)).toBe(true);
    }
  );
  it('keeps table hard breaks and literal br text through source and reload', () => {
    const pos = create(markdown('breaks', '| Header | Other |\n| --- | --- |\n| x | y |'));
    const table = editor.state.doc.nodeAt(pos)!.firstChild!;
    const json = table.toJSON();
    json.content[1].content[0].content = [
      {
        type: 'paragraph',
        content: [
          { type: 'hardBreak' },
          { type: 'text', text: '<br> literal', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          { type: 'hardBreak' },
          { type: 'text', text: 'last' },
          { type: 'hardBreak' },
        ],
      },
    ];
    const original = editor.schema.nodeFromJSON(json);
    editor.view.dispatch(editor.state.tr.replaceWith(pos + 1, pos + 1 + table.nodeSize, original));
    editor.commands.setTextSelection(pos + 5);
    expect(editSelectedCellSource(editor)).toBe(true);
    const source = editor.state.doc.nodeAt(pos)!.attrs.source;
    expect(source.split('\n')).toHaveLength(3);
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.firstChild!.eq(original)).toBe(true);
    const cells = convertEditorStateToCells(editor);
    editor.commands.setContent(convertCellsToHtml(cells));
    expect(editor.state.doc.child(1).firstChild!.eq(original)).toBe(true);
  });
  it('preserves Markdown table column alignment through source and HTML round trips', () => {
    const content = '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |';
    const pos = create(markdown('aligned', content));
    const check = () => {
      const table = editor.state.doc.nodeAt(pos)!.firstChild!;
      expect(table.type.name).toBe('table');
      table.forEach((row) => {
        expect([0, 1, 2].map((index) => row.child(index).attrs.textAlign)).toEqual([
          'left',
          'center',
          'right',
        ]);
      });
    };
    check();
    editor.commands.setTextSelection(pos + 5);
    expect(editSelectedCellSource(editor)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)?.attrs.source).toBe(content);
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    check();
    editor.commands.setContent(editor.getHTML());
    check();
    expect(convertEditorStateToCells(editor)[1].content).toBe(content);
  });
  it.each(['%20', '%2520', '100% complete', '\\n **literal** <tag> 中文'])(
    'preserves raw cell bytes through HTML and projection: %s',
    (content) => {
      const cell: Cell = { id: 'raw', type: 'raw', content, outputs: [] };
      create(cell);
      expect(convertEditorStateToCells(editor)[1].content).toBe(content);
      editor.commands.setContent(editor.getHTML());
      expect(convertEditorStateToCells(editor)[1].content).toBe(content);
    }
  );
  it('round trips nested lists, quoted code, images and math through the notebook parser', () => {
    const content =
      '10. first\n\n    second\n\n    - nested\n11. next\n\n> quoted\n>\n> ```python\n> print(1)\n> ```\n\nFormula $x^2$ and ![alt](https://example.com/a.png)';
    const pos = create(markdown('nested', content));
    const body = editor.state.doc.nodeAt(pos)!;
    expect(body.firstChild?.type.name).toBe('orderedList');
    expect(body.firstChild?.attrs.start).toBe(10);
    expect(body.firstChild?.firstChild?.child(2).type.name).toBe('bulletList');
    expect(body.child(1).lastChild?.type.name).toBe('fencedCodeBlock');
    const types: string[] = [];
    body.descendants((node) => {
      types.push(node.type.name);
    });
    expect(types).toContain('latexBlock');
    expect(types).toContain('markdownImage');
    editor.commands.setTextSelection(pos + 4);
    expect(editSelectedCellSource(editor)).toBe(true);
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const restored = editor.state.doc.nodeAt(pos)!;
    expect(restored.firstChild?.eq(body.firstChild!)).toBe(true);
    expect(restored.child(1).eq(body.child(1))).toBe(true);
    expect(restored.lastChild?.eq(body.lastChild!)).toBe(true);
  });
  it('serializes only the selected cell when opening source in a 1000-cell document', () => {
    editor = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(
        Array.from({ length: 1000 }, (_, index) =>
          markdown(`cell-${index}`, index ? 'Body' : '# Title')
        )
      ),
    });
    const pos = editor.state.doc.firstChild!.nodeSize;
    editor.commands.setTextSelection(pos + 2);
    const serialize = vi.spyOn(ProseMirrorNode.prototype, 'toJSON');
    try {
      expect(editSelectedCellSource(editor)).toBe(true);
      expect(serialize).toHaveBeenCalledTimes(2);
      expect(editor.state.doc.nodeAt(pos)?.attrs.source).toBe('Body');
    } finally {
      serialize.mockRestore();
    }
  });
  it('breaks a nested fence while retaining siblings, cell identity, caret and undo', () => {
    const content = 'Before\n\n~~~python\nprint(1)\n~~~\n\nAfter';
    const pos = create(markdown('mixed', content));
    const original = editor.state.doc;
    const cell = original.nodeAt(pos)!;
    editor.commands.setTextSelection(pos + 1 + cell.firstChild!.nodeSize + 1);
    expect(
      editor.view.someProp('handleKeyDown', (handler) =>
        handler(editor.view, new KeyboardEvent('keydown', { key: 'Backspace' }))
      )
    ).toBe(true);
    const source = editor.state.doc.nodeAt(pos)!;
    expect(source.attrs.source).toBe('Before\n\n~~python\nprint(1)\n~~~\n\nAfter');
    expect(source.attrs.caret).toBe('Before\n\n~~'.length);
    expect(source.attrs.cellId).toBe('mixed');
    expect(editor.state.doc.lastChild).toBe(original.lastChild);
    editor.commands.undo();
    expect(editor.state.doc.eq(original)).toBe(true);
  });
  it('does not convert a nested fence during ordinary character deletion or selection', () => {
    const pos = create(markdown('mixed', 'Before\n\n```python\nprint(1)\n```'));
    const start = pos + 2 + editor.state.doc.nodeAt(pos)!.firstChild!.nodeSize;
    editor.commands.setTextSelection(start + 1);
    expect(breakNestedCodeFence(editor)).toBe(false);
    editor.commands.setTextSelection({ from: start, to: start + 1 });
    expect(breakNestedCodeFence(editor)).toBe(false);
  });
  it.each([
    '> Before\n>\n> ```python\n> print(1)\n> ```\n>\n> After',
    '10. Before\n\n    ```python\n    print(1)\n    ```\n\n    After',
    '- Before\n\n  > quoted\n  >\n  > ~~~~python\n  > print(1)\n  > ~~~~\n\n  After',
  ])('breaks a structurally nested fence and preserves its containers: %s', (content) => {
    const pos = create(markdown('nested', content));
    const original = editor.state.doc;
    let codePos = -1;
    original.descendants((node, position) => {
      if (node.type.name === 'fencedCodeBlock') codePos = position;
    });
    expect(codePos).toBeGreaterThan(pos);
    const canonical = convertEditorStateToCells(editor)[1].content;
    editor.commands.setTextSelection(codePos + 1);
    expect(
      editor.view.someProp('handleKeyDown', (handler) =>
        handler(editor.view, new KeyboardEvent('keydown', { key: 'Backspace' }))
      )
    ).toBe(true);
    const source = editor.state.doc.nodeAt(pos)!;
    const delimiter = canonical.indexOf('python') - 1;
    expect(source.attrs.source).toBe(
      canonical.slice(0, delimiter) + canonical.slice(delimiter + 1)
    );
    expect(source.attrs.caret).toBe(delimiter);
    expect(source.attrs.cellId).toBe('nested');
    expect(editor.state.doc.lastChild).toBe(original.lastChild);
    editor.commands.undo();
    expect(editor.state.doc.eq(original)).toBe(true);
    editor.commands.redo();
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...editor.state.doc.nodeAt(pos)!.attrs,
        source: canonical,
      })
    );
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(convertEditorStateToCells(editor)[1].content).toBe(canonical);
  });
  it('breaks only the selected fence when identical fences occur in a quote', () => {
    const pos = create(
      markdown('duplicates', '> ```python\n> x\n> ```\n>\n> ```python\n> x\n> ```')
    );
    let lastCode = -1;
    editor.state.doc.descendants((node, position) => {
      if (node.type.name === 'fencedCodeBlock') lastCode = position;
    });
    const canonical = convertEditorStateToCells(editor)[1].content;
    const deletion = canonical.lastIndexOf('python') - 1;
    editor.commands.setTextSelection(lastCode + 1);
    expect(breakNestedCodeFence(editor)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)?.attrs.source).toBe(
      canonical.slice(0, deletion) + canonical.slice(deletion + 1)
    );
    expect(editor.state.doc.nodeAt(pos)?.attrs.caret).toBe(deletion);
  });
  it('preserves code outputs through HTML import and export', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'python',
      content: 'print(1)',
      outputs: [{ output_type: 'stream', text: '1' } as any],
    };
    create(cell);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject(cell);
    const html = editor.getHTML();
    editor.commands.setContent(html);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject(cell);
  });
  it('round trips mixed code and Mermaid fences without executing nested code', () => {
    const content =
      'Example\n\n````markdown\n```mermaid\ngraph TD; A-->B\n```\n````\n\n~~~mermaid\ngraph TD; B-->C\n~~~';
    const pos = create({ ...markdown('mixed', content), metadata: { editorMode: 'source' } });
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const types: string[] = [];
    editor.state.doc.child(1).forEach((node) => types.push(node.type.name));
    expect(types).toEqual(['paragraph', 'fencedCodeBlock', 'mermaidBlock']);
    expect(convertEditorStateToCells(editor)[1].content).toBe(content);
  });
  it('breaks the opening fence without losing code, language, ID or neighboring cells', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'javascript',
      content: 'old',
      outputs: [],
    };
    const pos = create(cell);
    expect(breakCodeBlockFence(editor, pos, { ...cell, content: 'const x = "<tag>";\n\n' })).toBe(
      true
    );
    const cells = convertEditorStateToCells(editor);
    expect(cells.map((cell) => cell.id)).toEqual(['title', 'code', 'after']);
    expect(cells[1]).toMatchObject({
      type: 'markdown',
      content: '``javascript\nconst x = "<tag>";\n\n\n```',
      metadata: { editorMode: 'source' },
    });
    expect(cells[2].content).toBe('Untouched');
    const reload = new Editor({
      extensions: getTipTapExtensions('Untitled'),
      content: convertCellsToHtml(cells),
    });
    expect(convertEditorStateToCells(reload)[1]).toMatchObject(cells[1]);
    reload.destroy();
  });

  it('undo restores the newest store-backed code rather than the original node content', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'python',
      content: 'old',
      outputs: [],
    };
    const pos = create(cell);
    breakCodeBlockFence(editor, pos, { ...cell, content: 'print("latest")' });
    expect(editor.commands.undo()).toBe(true);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject({
      id: 'code',
      type: 'code',
      content: 'print("latest")',
    });
    expect(editor.commands.redo()).toBe(true);
    expect(editor.state.doc.child(1).type.name).toBe('markdownSourceCell');
  });

  it('repairs a broken fence into an executable code cell', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'python',
      content: 'print(1)',
      outputs: [],
    };
    const pos = create(cell);
    breakCodeBlockFence(editor, pos, cell);
    const node = editor.state.doc.nodeAt(pos)!;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        source: '`' + node.attrs.source,
      })
    );
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject(cell);
  });
  it.each(['code', 'hybrid'] as const)(
    'restores %s origin through source HTML and saved-cell reload',
    (type) => {
      const cell: Cell = {
        id: 'origin',
        type,
        language: 'python',
        content: type === 'hybrid' ? '```python\nprint(1)\n```' : 'print(1)',
        outputs: [{ type: 'text', content: '1' }],
        metadata: { custom: 'keep' },
      };
      const pos = create(cell);
      const original = [markdown('title', '# Notebook'), cell, markdown('after', 'Untouched')];
      expect(breakCodeBlockFence(editor, pos, cell)).toBe(true);
      editor.commands.setContent(editor.getHTML());
      expect(editor.state.doc.nodeAt(pos)!.attrs.sourceCellType).toBe(type);
      const stored = JSON.parse(
        JSON.stringify(reconcileCells(convertEditorStateToCells(editor), original))
      ) as Cell[];
      expect(stored[1].metadata?.sourceCellType).toBe(type);
      editor.commands.setContent(convertCellsToHtml(stored));
      const source = editor.state.doc.nodeAt(pos)!;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(pos, undefined, {
          ...source.attrs,
          source: '`' + source.attrs.source,
        })
      );
      expect(previewMarkdownSource(editor, pos)).toBe(true);
      expect(editor.state.doc.nodeAt(pos)!.attrs.originalType).toBe(type);
      const restored = reconcileCells(convertEditorStateToCells(editor), stored);
      expect(restored[1]).toMatchObject(cell);
      expect(restored[1].metadata?.sourceCellType).toBeUndefined();
      expect(restored[1].metadata?.editorMode).toBeUndefined();
    }
  );
  it('positions the source caret after a shortened long delimiter and repairs at that position', () => {
    const cell: Cell = {
      id: 'long-fence',
      type: 'code',
      language: 'python',
      content: '```\nprint(1)',
      outputs: [],
    };
    const pos = create(cell);
    expect(breakCodeBlockFence(editor, pos, cell)).toBe(true);
    const source = editor.state.doc.nodeAt(pos)!;
    expect(source.attrs.source).toBe('```python\n```\nprint(1)\n````');
    expect(source.attrs.caret).toBe(3);
    const repaired =
      source.attrs.source.slice(0, source.attrs.caret) +
      '`' +
      source.attrs.source.slice(source.attrs.caret);
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, { ...source.attrs, source: repaired })
    );
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(convertEditorStateToCells(editor)[1]).toMatchObject(cell);
  });
  it('clears executable origin when source is deliberately changed into prose', () => {
    const cell: Cell = {
      ...markdown('origin', 'Plain prose'),
      metadata: { editorMode: 'source', sourceCellType: 'code', custom: 'keep' },
    };
    const pos = create(cell);
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const restored = reconcileCells(convertEditorStateToCells(editor), [cell]).find(
      (item) => item.id === 'origin'
    )!;
    expect(restored.type).toBe('markdown');
    expect(restored.metadata?.sourceCellType).toBeUndefined();
    expect(restored.metadata?.custom).toBe('keep');
  });
  it('retains outputs and metadata after a broken fence is saved, reloaded and repaired', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'python',
      content: 'print(1)',
      outputs: [{ type: 'text', content: '1' }],
      phaseId: 'phase',
      description: 'Example',
      metadata: { custom: { tags: ['keep'] }, executionCount: 3 },
    };
    const pos = create(cell);
    const original = [markdown('title', '# Notebook'), cell, markdown('after', 'Untouched')];
    expect(breakCodeBlockFence(editor, pos, cell)).toBe(true);
    const sourceCells = reconcileCells(convertEditorStateToCells(editor), original);
    const persisted: Cell[] = JSON.parse(JSON.stringify(sourceCells));
    editor.commands.setContent(convertCellsToHtml(persisted));
    const source = editor.state.doc.nodeAt(pos)!;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...source.attrs,
        source: '`' + source.attrs.source,
      })
    );
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const restored = reconcileCells(convertEditorStateToCells(editor), persisted);
    expect(restored[1]).toMatchObject(cell);
    expect(restored[1].metadata?.editorMode).toBeUndefined();
    synchronizeDocument(editor, restored);
    // Executable NodeViews read live outputs from the store, not stale node attrs.
    expect(reconcileCells(convertEditorStateToCells(editor), restored)[1]).toBe(restored[1]);
    editor.commands.setContent(convertCellsToHtml(JSON.parse(JSON.stringify(restored))));
    expect(convertEditorStateToCells(editor)[1].outputs).toEqual(cell.outputs);
  });
  it('keeps store-owned data through undo and redo of a fence break', () => {
    const cell: Cell = {
      id: 'code',
      type: 'code',
      language: 'python',
      content: 'print(1)',
      outputs: [{ type: 'text', content: '1' }],
      metadata: { executionCount: 4 },
    };
    const pos = create(cell);
    let stored = [markdown('title', '# Notebook'), cell, markdown('after', 'Untouched')];
    editor.on('update', ({ transaction }) => {
      if (!transaction.getMeta(EXTERNAL_CELL_SYNC))
        stored = reconcileCells(convertEditorStateToCells(editor), stored);
    });
    expect(breakCodeBlockFence(editor, pos, cell)).toBe(true);
    expect(stored[1].type).toBe('markdown');
    expect(stored[1].outputs).toBe(cell.outputs);
    expect(editor.commands.undo()).toBe(true);
    expect(stored[1]).toMatchObject(cell);
    expect(editor.commands.redo()).toBe(true);
    expect(stored[1].metadata).toMatchObject({ executionCount: 4, editorMode: 'source' });
    expect(stored[1].outputs).toBe(cell.outputs);
  });

  it('persists source mode and exits it even when Markdown text did not change', () => {
    const cell = markdown('body', 'Hello');
    const pos = create(cell);
    editor.commands.setTextSelection(pos + 2);
    expect(editSelectedCellSource(editor)).toBe(true);
    const sourceCells = convertEditorStateToCells(editor);
    expect(sourceCells[1].metadata?.editorMode).toBe('source');
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    const cells = reconcileCells(convertEditorStateToCells(editor), sourceCells);
    expect(cells[1].metadata?.editorMode).toBeUndefined();
    synchronizeDocument(editor, cells);
    expect(editor.state.doc.child(1).type.name).toBe('markdownCell');
  });

  it('previews Mermaid source as a diagram without turning it into executable Python', () => {
    const cell = {
      ...markdown('diagram', '```mermaid\ngraph TD; A-->B\n```'),
      metadata: { editorMode: 'source' },
    };
    const pos = create(cell);
    previewMarkdownSource(editor, pos);
    expect(editor.state.doc.child(1).firstChild?.type.name).toBe('mermaidBlock');
    expect(convertEditorStateToCells(editor)[1].content).toBe(cell.content);
  });

  it('converts executable source into a diagram and preserves store data through undo/redo', () => {
    const cell: Cell = {
      id: 'code-to-diagram',
      type: 'code',
      language: 'python',
      content: 'print(1)',
      outputs: [{ type: 'text', content: '1' }],
      metadata: { custom: 'retained' },
    };
    const pos = create(cell);
    let stored = [markdown('title', '# Notebook'), cell, markdown('after', 'Untouched')];
    editor.on('update', ({ transaction }) => {
      if (!transaction.getMeta(EXTERNAL_CELL_SYNC))
        stored = reconcileCells(convertEditorStateToCells(editor), stored);
    });
    expect(editCodeBlockSource(editor, pos, cell)).toBe(true);
    const source = '```mermaid\nflowchart LR\n A-->B\n```';
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...editor.state.doc.nodeAt(pos)!.attrs,
        source,
      })
    );
    expect(previewMarkdownSource(editor, pos)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.firstChild?.type.name).toBe('mermaidBlock');
    expect(stored[1]).toMatchObject({
      id: cell.id,
      type: 'markdown',
      content: source,
      outputs: cell.outputs,
      metadata: { custom: 'retained' },
    });
    expect(stored[1].metadata?.editorMode).toBeUndefined();
    expect(editor.commands.undo()).toBe(true);
    expect(stored[1].metadata?.editorMode).toBe('source');
    expect(stored[1].content).toBe(source);
    expect(editor.commands.redo()).toBe(true);
    expect(stored[1].content).toBe(source);
    expect(stored[1].outputs).toBe(cell.outputs);
    editor.commands.setContent(convertCellsToHtml(JSON.parse(JSON.stringify(stored))));
    expect(editor.state.doc.nodeAt(pos)!.firstChild?.type.name).toBe('mermaidBlock');
  });
});
