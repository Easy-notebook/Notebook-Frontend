import { describe, it, expect } from 'vitest';
import { buildEditorFromExtensions, $getExtensionOutput } from '@lexical/extension';
import { DOMImportExtension, $generateHtmlFromNodes } from '@lexical/html';
import { NotebookHtmlExtension } from './NotebookHtml';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { createNotebookExtension, $readCells } from './NotebookDocument';
import { NotebookCellNode } from './NotebookCellNode';
import { NotebookPluginRegistry } from '../extensionPoints';
import { ScientificExtension } from './ScientificNode';
import { ImageExtension } from './ImageNode';
import { FencedCodeSourceNode, FencedCodeSourceExtension } from './FencedCodeSource';
import { MarkdownTableSemanticsExtension } from './MarkdownTable';
const registry = new NotebookPluginRegistry([
  {
    id: 'markdown',
    extensions: [
      NotebookHtmlExtension,
      ScientificExtension,
      ImageExtension,
      FencedCodeSourceExtension,
      MarkdownTableSemanticsExtension,
    ],
  },
]);
const sources = [
  '## Heading\n\n### Heading\n\n###### Sixth',
  '3. three\n4. four\n   - nested',
  '> quote\n>\n> **bold** and _italic_',
  '| A | B |\n| :--- | ---: |\n| 1 | 2 |',
  'Inline $x^2$ and \\(y\\).\n\n$$\nx+y\n$$',
  '```mermaid\ngraph TD\nA-->B\n```',
  '![image](https://example.com/image.png "Title")',
  '~~~~python extra\nprint(1)\n~~~~',
  '```python\nunfinished',
  '<table><tr><th>A</th><th>B</th></tr><tr><td><p>one</p><p>two</p></td><td>three</td></tr></table>',
];
describe('authored Markdown preservation', () => {
  it('imports Mermaid through the ordinary code-fence node', () => {
    const cell = {
      id: 'diagram',
      type: 'markdown' as const,
      content: '```mermaid\ngraph TD\nA-->B\n```',
      outputs: [],
    };
    const editor = buildEditorFromExtensions(createNotebookExtension([cell], false, registry));
    editor.update(() => {}, { discrete: true });
    editor.read(() => {
      const wrapper = $getRoot().getFirstChild() as NotebookCellNode;
      const code = wrapper.getFirstChild();
      expect(code).toBeInstanceOf(FencedCodeSourceNode);
      expect((code as FencedCodeSourceNode).getLanguage()).toBe('mermaid');
    });
    editor.dispose();
  });

  it.each(sources)('keeps source byte-for-byte until that cell is edited: %s', (source) => {
    const cell = { id: 'body', type: 'markdown' as const, content: source, outputs: [] };
    const editor = buildEditorFromExtensions(createNotebookExtension([cell], false, registry));
    editor.update(() => {}, { discrete: true });
    expect(editor.getEditorState().read(() => $readCells(() => cell), { editor })[0].content).toBe(
      source
    );
    editor.dispose();
  });
  it('keeps unfinished fence delimiters when another block in the same cell changes', () => {
    const cell = {
      id: 'body',
      type: 'markdown' as const,
      content: 'paragraph\n\n```python\nunfinished',
      outputs: [],
    };
    const editor = buildEditorFromExtensions(createNotebookExtension([cell], false, registry));
    editor.update(() => {}, { discrete: true });
    editor.update(
      () => {
        const cell = $getRoot().getFirstChild() as NotebookCellNode;
        cell.getFirstChild()!.replace($createParagraphNode().append($createTextNode('edited')));
      },
      { discrete: true }
    );
    const result = editor
      .getEditorState()
      .read(() => $readCells(() => cell), { editor })[0].content;
    expect(result).toContain('edited');
    expect(result).toContain('```python\nunfinished');
    expect(result.match(/```/g)?.length).toBe(1);
    editor.dispose();
  });
  it('retains embedded cell content and identity through the public HTML format', () => {
    const cells = [
      {
        id: 'code',
        type: 'code' as const,
        content: 'print("<hello>")',
        language: 'python' as const,
        outputs: [],
      },
    ];
    const editor = buildEditorFromExtensions(createNotebookExtension(cells, false, registry));
    editor.update(() => {}, { discrete: true });
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor), { editor });
    editor.update(
      () => {
        const nodes = $getExtensionOutput(DOMImportExtension).$generateNodesFromDOM(
          new DOMParser().parseFromString(html, 'text/html')
        );
        $getRoot()
          .clear()
          .append(...nodes);
      },
      { discrete: true }
    );
    const result = editor
      .getEditorState()
      .read(() => $readCells((id) => cells.find((cell) => cell.id === id)), { editor });
    expect(result[0]).toMatchObject(cells[0]);
    editor.dispose();
  });
  it('retains formulas and images inside rich table cells when adjacent text changes', () => {
    const cell = {
      id: 'rich',
      type: 'markdown' as const,
      outputs: [],
      content:
        'before\n\n<table><tr><td colwidth="180"><p>Formula <span data-type="latex-block" data-latex="x^2" data-display-mode="false"></span></p><p><img src="https://example.com/a.png" alt="diagram"></p></td></tr></table>',
    };
    const editor = buildEditorFromExtensions(createNotebookExtension([cell], false, registry));
    editor.update(() => {}, { discrete: true });
    editor.update(
      () => {
        ($getRoot().getFirstChild() as NotebookCellNode)
          .getFirstChild()!
          .replace($createParagraphNode().append($createTextNode('after')));
      },
      { discrete: true }
    );
    const content = editor
      .getEditorState()
      .read(() => $readCells(() => cell), { editor })[0].content;
    expect(content).toContain('x^2');
    expect(content).toContain('https://example.com/a.png');
    expect(content).toContain('180');
    editor.dispose();
  });
});
