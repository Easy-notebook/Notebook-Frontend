import {
  $copyNode,
  $createNodeSelection,
  $createRangeSelection,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $isElementNode,
  $setSelection,
  HISTORY_PUSH_TAG,
  type LexicalNode,
} from 'lexical';
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from '@lexical/rich-text';
import { $createListNode, $createListItemNode } from '@lexical/list';
import { $convertSelectionToMarkdownString } from '@lexical/mdast';
import { $createTableNodeWithDimensions } from '@lexical/table';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { EmbeddedCellNode } from '../model/EmbeddedCellNode';
import { ScientificNode } from '../model/ScientificNode';
import { ImageNode } from '../model/ImageNode';
import { PersistentBlockNode, $createPersistentBlock } from '../blocks/PersistentBlockNode';
import { newBlockMetadata, type BlockMetadata } from '../blocks/BlockMetadata';
import { $wrapColumns } from '../columns/ColumnController';
import { ColumnNode } from '../columns/ColumnNodes';
import { formatCodeFence } from '@Utils/markdown/fencedMarkdown';
import type { NotebookEditorSession } from './NotebookEditorSession';

export const BLOCK_TYPES = [
  ['paragraph', '段落'],
  ['h1', '标题 1'],
  ['h2', '标题 2'],
  ['h3', '标题 3'],
  ['h4', '标题 4'],
  ['h5', '标题 5'],
  ['h6', '标题 6'],
  ['bullet', '无序列表'],
  ['number', '有序列表'],
  ['quote', '引用'],
  ['code', '代码单元'],
  ['table', '表格'],
  ['math', '数学公式'],
  ['mermaid', 'Mermaid 图表'],
  ['image', '图片'],
  ['raw', '原始文本'],
  ['agent', 'Agent 对话'],
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number][0];
/** A block is a content unit; cell wrappers remain persistence boundaries. */
export function $notebookBlock(node: LexicalNode | null): LexicalNode | null {
  if (node instanceof EmbeddedCellNode) return node;
  while (node) {
    const parent = node.getParent();
    if (parent instanceof NotebookCellNode) return parent.isTitle() ? null : node;
    if (parent instanceof ColumnNode) return node;
    if (!parent) return null;
    node = parent;
  }
  return null;
}
function $clone(node: LexicalNode): LexicalNode {
  const copy = $copyNode(node);
  if (copy instanceof PersistentBlockNode)
    copy.setMetadata({ ...copy.metadata(), id: newBlockMetadata().id });
  if ($isElementNode(node) && $isElementNode(copy)) copy.append(...node.getChildren().map($clone));
  return copy;
}
export class NotebookBlockCommands {
  constructor(readonly session: NotebookEditorSession) {}
  private mutate(key: string, action: (node: LexicalNode) => void) {
    if (!this.session.owns() || !this.session.editor.isEditable()) return;
    this.session.editor.update(
      () => {
        const node = $notebookBlock($getNodeByKey(key));
        if (node?.isAttached()) action(node);
      },
      { discrete: true, tag: HISTORY_PUSH_TAG }
    );
  }
  describe(key: string) {
    return this.session.editor.getEditorState().read(
      () => {
        const node = $notebookBlock($getNodeByKey(key));
        if (!node?.isAttached()) return null;
        const selection = $createRangeSelection();
        const parent = node.getParentOrThrow();
        const index = node.getIndexWithinParent();
        selection.anchor.set(parent.getKey(), index, 'element');
        selection.focus.set(parent.getKey(), index + 1, 'element');
        const markdown =
          node instanceof EmbeddedCellNode
            ? node.toCell().type === 'code'
              ? formatCodeFence(node.toCell().content, node.toCell().language ?? 'python')
              : node.toCell().content
            : $convertSelectionToMarkdownString(selection);
        return {
          markdown,
          characters: Array.from(node.getTextContent()).length,
          rich: !(node instanceof EmbeddedCellNode),
          executable:
            node instanceof EmbeddedCellNode || node.getParent() instanceof NotebookCellNode,
          metadata: node instanceof PersistentBlockNode ? node.metadata() : null,
        };
      },
      { editor: this.session.editor }
    );
  }
  private create(type: BlockType): LexicalNode {
    if (type === 'code' || type === 'mermaid' || type === 'raw' || type === 'agent')
      return this.session.createEmbedded({
        id: crypto.randomUUID(),
        type: type === 'mermaid' ? 'code' : type,
        content: '',
        outputs: [],
        enableEdit: true,
        ...(type === 'code' || type === 'mermaid'
          ? { language: type === 'mermaid' ? 'mermaid' : 'python' }
          : {}),
      });
    if (/^h[1-6]$/.test(type)) return $createHeadingNode(type as HeadingTagType);
    if (type === 'quote') return $createQuoteNode();
    if (type === 'bullet' || type === 'number')
      return $createListNode(type).append($createListItemNode());
    if (type === 'table') return $createTableNodeWithDimensions(3, 3, true);
    if (type === 'math')
      return new ScientificNode({ syntax: 'math', display: true, value: 'E = mc^2' });
    if (type === 'image') return new ImageNode({ src: '', alt: '', displayMode: true });
    return $createParagraphNode();
  }
  private place(node: LexicalNode, addition: LexicalNode, after: boolean) {
    if (node instanceof EmbeddedCellNode) {
      const wrapper =
        addition instanceof EmbeddedCellNode ? addition : new NotebookCellNode().append(addition);
      if (after) node.insertAfter(wrapper);
      else node.insertBefore(wrapper);
      return;
    }
    if (addition instanceof EmbeddedCellNode) {
      // Executable cells are root-level notebook records, never nested into rich content.
      const cell = node.getParent();
      if (!(cell instanceof NotebookCellNode)) return;
      const tail = after ? node.getNextSiblings() : [node, ...node.getNextSiblings()];
      cell.insertAfter(addition);
      if (tail.length) addition.insertAfter(new NotebookCellNode().append(...tail));
      if (!cell.getChildrenSize()) cell.remove();
    } else if (after) node.insertAfter(addition);
    else node.insertBefore(addition);
  }
  private focus(node: LexicalNode) {
    if ($isElementNode(node)) node.selectStart();
    else {
      const selection = $createNodeSelection();
      selection.add(node.getKey());
      $setSelection(selection);
      if (node instanceof EmbeddedCellNode) this.session.focusEmbeddedCell(node.getCellId());
    }
  }
  insert(key: string, type: BlockType, after = true) {
    this.mutate(key, (node) => {
      if (
        ['code', 'raw', 'agent'].includes(type) &&
        !(node instanceof EmbeddedCellNode) &&
        !(node.getParent() instanceof NotebookCellNode)
      )
        return;
      const addition = this.create(type);
      this.place(node, addition, after);
      if (addition.isAttached()) this.focus(addition);
    });
  }
  duplicate(key: string) {
    this.mutate(key, (node) => {
      const copy =
        node instanceof EmbeddedCellNode
          ? this.session.createEmbedded({
              ...node.toCell(this.session.cell(node.getCellId())),
              id: crypto.randomUUID(),
              outputs: [],
            })
          : $clone(node);
      this.place(node, copy, true);
      this.focus(copy);
    });
  }
  delete(key: string) {
    this.mutate(key, (node) => {
      const parent = node.getParent();
      const next = node.getNextSibling() ?? node.getPreviousSibling();
      node.remove();
      if (next) this.focus(next);
      else if (parent instanceof NotebookCellNode || parent instanceof ColumnNode)
        parent.append($createParagraphNode()).selectStart();
    });
  }
  convert(key: string, type: BlockType) {
    this.mutate(key, (node) => {
      if (node instanceof EmbeddedCellNode) return;
      if (type === 'code') {
        if (!(node.getParent() instanceof NotebookCellNode)) return;
        const text = node.getTextContent();
        const code = this.session.createEmbedded({
          id: crypto.randomUUID(),
          type: 'code',
          content: text,
          language: 'python',
          outputs: [],
          enableEdit: true,
        });
        this.place(node, code, true);
        node.remove();
        const owner = code.getPreviousSibling();
        if (owner instanceof NotebookCellNode && !owner.getChildrenSize()) owner.remove();
        this.focus(code);
        return;
      }
      const replacement = this.create(type);
      if (!$isElementNode(replacement)) return;
      if (type === 'bullet' || type === 'number')
        replacement
          .getFirstChildOrThrow<import('lexical').ElementNode>()
          .append($createTextNode(node.getTextContent()));
      else if ($isElementNode(node) && ['paragraph', 'heading', 'quote'].includes(node.getType()))
        replacement.append(...node.getChildren());
      else replacement.append($createTextNode(node.getTextContent()));
      node.replace(replacement);
      this.focus(replacement);
    });
  }
  decorate(key: string, change: Partial<BlockMetadata>) {
    this.mutate(key, (node) => {
      if (node instanceof EmbeddedCellNode) return;
      let block: PersistentBlockNode;
      if (node instanceof PersistentBlockNode) block = node;
      else {
        block = $createPersistentBlock(newBlockMetadata());
        node.replace(block);
        block.append(node);
      }
      block.setMetadata({ ...block.metadata(), ...change });
    });
  }
  columns(key: string, count: number) {
    this.mutate(key, (node) => {
      if (!(node instanceof EmbeddedCellNode)) $wrapColumns([node], count);
    });
  }
  move(key: string, targetKey: string, after: boolean) {
    this.mutate(key, (node) => {
      const target = $notebookBlock($getNodeByKey(targetKey));
      if (!target?.isAttached() || target === node || $notebookBlock(target) !== target) return;
      if ($isElementNode(node) && node.isParentOf(target)) return;
      if (
        node instanceof EmbeddedCellNode &&
        !(target instanceof EmbeddedCellNode) &&
        !(target.getParent() instanceof NotebookCellNode)
      )
        return;
      const owner = node.getParent();
      this.place(target, node, after);
      if (owner instanceof NotebookCellNode && !owner.getChildrenSize()) owner.remove();
      if (owner instanceof ColumnNode && !owner.getChildrenSize())
        owner.append($createParagraphNode());
      this.focus(node);
    });
  }
  link(key: string): string {
    let id = '';
    this.mutate(key, (node) => {
      if (node instanceof EmbeddedCellNode) {
        id = 'cell-' + node.getCellId();
        return;
      }
      let block: PersistentBlockNode;
      if (node instanceof PersistentBlockNode) block = node;
      else {
        block = $createPersistentBlock(newBlockMetadata());
        node.replace(block);
        block.append(node);
      }
      id = 'block-' + block.metadata().id;
    });
    return `${window.location.origin}/workspace/${encodeURIComponent(this.session.notebookId ?? '')}#${id}`;
  }
}
