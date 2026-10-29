import { defineExtension, configExtension, $createParagraphNode, $isElementNode } from 'lexical';
import { DOMImportExtension, defineImportRule, sel } from '@lexical/html';
import { $createTableCellNode, TableCellHeaderStates } from '@lexical/table';
import { ScientificNode } from './ScientificNode';
import { ImageNode } from './ImageNode';
import { EmbeddedCellNode } from './EmbeddedCellNode';
import { NotebookCellNode } from './NotebookCellNode';
import type { Cell } from '@Store/models';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { $createFencedCodeSource, parseCodeFence } from './FencedCodeSource';
import { decodeTextAttribute } from '../../utils/encodedText';
/** Semantic HTML is part of the persisted Markdown format, including rich table cells. */
export const NotebookHtmlExtension = defineExtension({
  name: 'notebook/semantic-html',
  dependencies: [
    configExtension(DOMImportExtension, {
      rules: [
        defineImportRule({
          name: 'notebook/html-rich-cell',
          match: sel.css(
            '[data-cell-id][data-type="markdown-cell"], [data-cell-id][data-type="title"]'
          ),
          $import: (ctx, el) => [
            new NotebookCellNode(
              el.getAttribute('data-cell-id') || crypto.randomUUID(),
              'markdown',
              null,
              null,
              el.getAttribute('data-type') === 'title'
            ).append(...ctx.$importChildren(el)),
          ],
        }),
        defineImportRule({
          name: 'notebook/html-embedded-cell',
          match: sel.css('[data-type="notebook-embedded"]'),
          $import: (ctx, el) => {
            const kind = el.getAttribute('data-cell-kind');
            const kinds: Cell['type'][] = [
              'code',
              'hybrid',
              'agent',
              'thinking',
              'image',
              'link',
              'raw',
              'markdown',
            ];
            if (!kinds.includes(kind as Cell['type'])) return ctx.$importChildren(el);
            return [
              new EmbeddedCellNode({
                id: el.getAttribute('data-cell-id') || crypto.randomUUID(),
                type: kind as Cell['type'],
                content: decodeTextAttribute(el.getAttribute('data-source')),
                language: el.hasAttribute('data-language')
                  ? normalizeCodeLanguage(el.getAttribute('data-language') ?? undefined)
                  : undefined,
                outputs: [],
                metadata: {
                  editorMode: el.getAttribute('data-editor-mode') || undefined,
                  sourceCellType: el.getAttribute('data-source-cell-type') || undefined,
                },
              }),
            ];
          },
        }),
        defineImportRule({
          name: 'notebook/html-formula',
          match: sel.css('[data-type="latex-block"]'),
          $import: (_ctx, el) => [
            new ScientificNode({
              syntax: el.getAttribute('data-display-mode') === 'true' ? 'math' : 'inlineMath',
              value: el.getAttribute('data-latex') ?? '',
              display: el.getAttribute('data-display-mode') === 'true',
            }),
          ],
        }),
        defineImportRule({
          name: 'notebook/html-image',
          match: sel.css('[data-type="markdown-image"], img'),
          $import: (_ctx, el) => [
            new ImageNode({
              src: el.getAttribute('data-src') ?? el.getAttribute('src') ?? '',
              alt: el.getAttribute('data-alt') ?? el.getAttribute('alt') ?? '',
              title: el.getAttribute('data-title') ?? el.getAttribute('title'),
              displayMode: el.getAttribute('data-display-mode') !== 'false',
            }),
          ],
        }),
        defineImportRule({
          name: 'notebook/html-fence',
          match: sel.css('pre[data-type="fenced-code-source"],pre[data-type="fenced-code-block"]'),
          $import: (ctx, el) => {
            const source = el.getAttribute('data-source')
              ? decodeTextAttribute(el.getAttribute('data-source'))
              : (el.textContent ?? '');
            return parseCodeFence(source)
              ? [$createFencedCodeSource(source)]
              : ctx.$importChildren(el);
          },
        }),
        defineImportRule({
          name: 'notebook/html-cell-width',
          match: sel.css('td[colwidth],th[colwidth]'),
          $import: (ctx, el) => {
            const raw = Number(el.getAttribute('colwidth')?.split(',')[0]);
            const node = $createTableCellNode(
              el.tagName === 'TH' ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS,
              Math.max(1, Number(el.getAttribute('colspan') || 1)),
              Number.isFinite(raw) && raw > 0 ? raw : undefined
            );
            node.setRowSpan(Math.max(1, Number(el.getAttribute('rowspan') || 1)));
            const children = ctx.$importChildren(el);
            let paragraph: ReturnType<typeof $createParagraphNode> | null = null;
            for (const child of children) {
              if ($isElementNode(child) && !child.isInline()) {
                paragraph = null;
                node.append(child);
              } else {
                if (!paragraph) {
                  paragraph = $createParagraphNode();
                  node.append(paragraph);
                }
                paragraph.append(child);
              }
            }
            if (!node.getChildrenSize()) node.append($createParagraphNode());
            return [node];
          },
        }),
      ],
    }),
  ],
});
