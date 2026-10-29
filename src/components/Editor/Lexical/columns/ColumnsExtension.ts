import { $getRenderContextValue } from '@lexical/html';
import {
  $createParagraphNode,
  $getNodeByKey,
  $addUpdateTag,
  HISTORY_PUSH_TAG,
  COMMAND_PRIORITY_EDITOR,
  configExtension,
  defineExtension,
  type BaseSelection,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import {
  MdastImportExtension,
  RenderContextMarkdownSelection,
  type MdastNode,
} from '@lexical/mdast';
import { ColumnsNode, ColumnNode, $createColumns, $createColumn } from './ColumnNodes';
import { COLUMN_ACTION } from './ColumnActions';
import { $setColumnCount, $unwrapColumns } from './ColumnController';
import { columnsFromMarkdown, columnsToMarkdown, type ColumnsAst } from './ColumnMarkdown';
import { registerColumnResize } from './ColumnResize';
import './columns.css';
export const ColumnsExtension = defineExtension({
  name: 'notebook/document-columns',
  nodes: [ColumnsNode, ColumnNode],
  dependencies: [
    configExtension(MdastImportExtension, {
      mdastExtensions: [columnsFromMarkdown],
      toMarkdownExtensions: [columnsToMarkdown],
      importRules: [
        {
          type: 'notebookColumns',
          $import: (node, context) =>
            $createColumns((node as ColumnsAst).metadata.widths).append(
              ...context.importChildren(node)
            ),
        },
        {
          type: 'notebookColumn',
          $import: (node, context) => {
            const children = context.importChildren(node);
            return $createColumn().append(
              ...(children.length ? children : [$createParagraphNode()])
            );
          },
        },
      ],
      exportRules: [
        {
          type: 'document-columns',
          $export: (node, context) => {
            if (!(node instanceof ColumnsNode)) return null;
            const selection = $getRenderContextValue<BaseSelection | null>(
              RenderContextMarkdownSelection
            );
            const children = context.exportChildren(node);
            return selection && !node.isSelected(selection)
              ? children
              : ({
                  type: 'notebookColumns',
                  metadata: { version: 1, widths: node.widths() },
                  children,
                } as MdastNode);
          },
        },
        {
          type: 'document-column',
          $export: (node, context) => {
            if (!(node instanceof ColumnNode)) return null;
            const selection = $getRenderContextValue<BaseSelection | null>(
              RenderContextMarkdownSelection
            );
            const children = context.exportChildren(node);
            return selection && !node.getParent()?.isSelected(selection)
              ? children
              : ({ type: 'notebookColumn', children } as MdastNode);
          },
        },
      ],
    }),
  ],
  register(editor) {
    return mergeRegister(
      editor.registerEditableListener((editable) => {
        const root = editor.getRootElement();
        root
          ?.querySelectorAll<HTMLElement>('.document-columns-controls,.document-column-divider')
          .forEach((element) => {
            element.hidden = !editable;
          });
        root?.querySelectorAll<HTMLElement>('.document-columns').forEach((element) => {
          element.dataset.readonly = String(!editable);
        });
      }),
      editor.registerNodeTransform(ColumnNode, (node) => {
        if (node.isEmpty()) node.append($createParagraphNode());
      }),
      editor.registerCommand(
        COLUMN_ACTION,
        (payload) => {
          if (!editor.isEditable()) return false;
          const node = $getNodeByKey(payload.key);
          if (!(node instanceof ColumnsNode)) return false;
          $addUpdateTag(HISTORY_PUSH_TAG);
          if (payload.action === 'count') $setColumnCount(node, payload.count);
          else $unwrapColumns(node);
          return true;
        },
        COMMAND_PRIORITY_EDITOR
      ),
      typeof window !== 'undefined' ? registerColumnResize(editor) : () => {}
    );
  },
});
