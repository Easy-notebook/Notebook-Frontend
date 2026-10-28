import { MarkdownSourceBlockNode } from '../model/MarkdownSourceBlockNode';
import { $isListItemNode, $isListNode, $createListNode } from '@lexical/list';
import { MarkdownSourceNode } from '../model/MarkdownSourceNode';
import {
  $copyNode,
  $addUpdateTag,
  HISTORY_PUSH_TAG,
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $setSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
  type RangeSelection,
} from 'lexical';
import { $isLinkNode } from '@lexical/link';
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import { $convertToMarkdownString, $generateNodesFromMarkdownString } from '@lexical/mdast';
import { $cellAncestor } from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';

function $cloneTree(node: LexicalNode): LexicalNode {
  const clone = $copyNode(node);
  if ($isElementNode(node) && $isElementNode(clone))
    clone.append(...node.getChildren().map($cloneTree));
  return clone;
}
/** Use the notebook's Markdown codec, including escaping and nested formatting. */
export function $sourceForNode(node: LexicalNode): string {
  const wrapper = $createParagraphNode();
  if ($isListItemNode(node) && $isListNode(node.getParent())) {
    const list = node.getParentOrThrow();
    if ($isListNode(list))
      wrapper.append(
        $createListNode(list.getListType(), list.getStart() + node.getIndexWithinParent()).append(
          $cloneTree(node)
        )
      );
  } else wrapper.append($cloneTree(node));
  return $convertToMarkdownString(wrapper).trimEnd();
}
export function $sourceTarget(): LexicalNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text')
    return null;
  const node = selection.anchor.getNode();
  let ancestor: LexicalNode | null = node;
  while (ancestor) {
    if (ancestor instanceof MarkdownSourceNode) return null;
    ancestor = ancestor.getParent();
  }
  const cell = $cellAncestor(node);
  if (!(cell instanceof NotebookCellNode) || cell.isTitle()) return null;
  const parent = node.getParent();
  if ($isLinkNode(node)) return node;
  if ($isLinkNode(parent)) return parent;
  if (
    $isTextNode(node) &&
    ['bold', 'italic', 'strikethrough', 'code'].some((format) =>
      node.hasFormat(format as 'bold' | 'italic' | 'strikethrough' | 'code')
    )
  )
    return node;
  let block: LexicalNode | null = node;
  while (block && block !== cell) {
    if ($isHeadingNode(block) || $isQuoteNode(block) || $isListItemNode(block)) return block;
    block = block.getParent();
  }
  return null;
}

/** Expand the actual document node without changing the surrounding paragraph. */
export function $expandSource(node: LexicalNode, edge?: 'start' | 'end'): MarkdownSourceNode {
  const selection = $getSelection();
  const anchor = $isRangeSelection(selection) ? selection.anchor : null;
  const source = $sourceForNode(node);
  const text = anchor?.getNode().getTextContent() ?? '';
  const offset =
    text.length === 0
      ? source.length
      : Math.max(0, source.indexOf(text)) + (anchor?.type === 'text' ? anchor.offset : 0);
  const block = !node.isInline() && !$isTextNode(node);
  const textNode = $createTextNode(source);
  const raw = new MarkdownSourceNode(block).append(textNode);
  if ($isListItemNode(node) && $isListNode(node.getParent())) {
    const list = node.getParentOrThrow();
    if ($isListNode(list)) {
      const index = node.getIndexWithinParent(),
        children = list.getChildren();
      if (index > 0)
        list.insertBefore(
          $createListNode(list.getListType(), list.getStart()).append(...children.slice(0, index))
        );
      list.insertBefore(new MarkdownSourceBlockNode().append(raw));
      if (index + 1 < children.length)
        list.insertBefore(
          $createListNode(list.getListType(), list.getStart() + index + 1).append(
            ...children.slice(index + 1)
          )
        );
      list.remove();
    }
  } else if (block) node.replace(new MarkdownSourceBlockNode().append(raw));
  else node.replace(raw);
  const caret =
    edge === 'start' ? 0 : edge === 'end' ? source.length : Math.min(offset, source.length);
  textNode.select(caret, caret);
  return raw;
}
/** Leave incomplete syntax literal; replace only the source fragment, never its siblings. */
export function $collapseSource(raw: MarkdownSourceNode, preserveSelection = false) {
  if (!raw.isAttached()) return;
  const current = $getSelection();
  const selection = preserveSelection && $isRangeSelection(current) ? current.clone() : null;
  const offsets = selection
    ? [selection.anchor, selection.focus].map((point) =>
        $sourceAncestor(point.getNode()) === raw ? $sourceOffset(raw, point) : null
      )
    : [];
  const source = raw.getTextContent();
  const parsed = $generateNodesFromMarkdownString(source);
  const block = raw.isBlockSource() && raw.getParent()?.getChildrenSize() === 1;
  const target = block ? raw.getParentOrThrow() : raw;
  const replacements = block
    ? parsed.length
      ? parsed
      : [$createParagraphNode()]
    : parsed.length === 1 && parsed[0].getType() === 'paragraph' && $isElementNode(parsed[0])
      ? parsed[0].getChildren()
      : source
        ? [$createTextNode(source)]
        : [];
  for (const replacement of replacements) target.insertBefore(replacement);
  if (selection) {
    const texts = replacements.flatMap((node) =>
      $isTextNode(node) ? [node] : $isElementNode(node) ? node.getAllTextNodes() : []
    );
    let cursor = 0;
    const positions = texts.map((node) => {
      const start = Math.max(cursor, source.indexOf(node.getTextContent(), cursor));
      cursor = start + node.getTextContentSize();
      return { node, start, end: cursor };
    });
    [selection.anchor, selection.focus].forEach((point, index) => {
      const offset = offsets[index];
      if (offset === null || offset === undefined) return;
      const match =
        positions.find((entry) => offset <= entry.end) ?? positions[positions.length - 1];
      if (match)
        point.set(
          match.node.getKey(),
          Math.max(0, Math.min(match.node.getTextContentSize(), offset - match.start)),
          'text'
        );
      else if ($isElementNode(replacements[0])) point.set(replacements[0].getKey(), 0, 'element');
    });
    selection.setFormat(0);
    selection.setStyle('');
    $setSelection(selection);
  }
  target.remove();
  for (const replacement of replacements) {
    if (!$isListNode(replacement) || !replacement.isAttached()) continue;
    const previous = replacement.getPreviousSibling();
    if ($isListNode(previous) && previous.getListType() === replacement.getListType()) {
      replacement.splice(0, 0, previous.getChildren());
      replacement.setStart(previous.getStart());
      previous.remove();
    }
    const next = replacement.getNextSibling();
    if ($isListNode(next) && next.getListType() === replacement.getListType()) {
      replacement.append(...next.getChildren());
      next.remove();
    }
  }
}

export function $sourceAncestor(node: LexicalNode | null): MarkdownSourceNode | null {
  while (node) {
    if (node instanceof MarkdownSourceNode) return node;
    node = node.getParent();
  }
  return null;
}
/** Preserve a source range when native replacement would delete its entire inline wrapper. */
export function $replaceSourceSelection(selection: RangeSelection, value: string): boolean {
  const source = $sourceAncestor(selection.anchor.getNode());
  if (!source || source !== $sourceAncestor(selection.focus.getNode())) return false;
  const start = Math.min(
    $sourceOffset(source, selection.anchor),
    $sourceOffset(source, selection.focus)
  );
  const end = Math.max(
    $sourceOffset(source, selection.anchor),
    $sourceOffset(source, selection.focus)
  );
  const text = $createTextNode(
    source.getTextContent().slice(0, start) + value + source.getTextContent().slice(end)
  );
  if (!selection.isCollapsed()) $addUpdateTag(HISTORY_PUSH_TAG);
  source.splice(0, source.getChildrenSize(), [text]);
  text.select(start + value.length, start + value.length);
  return true;
}

export function $sourceOffset(source: MarkdownSourceNode, point: RangeSelection['anchor']) {
  let node = point.getNode();
  let result =
    point.type === 'text'
      ? point.offset
      : $isElementNode(node)
        ? node
            .getChildren()
            .slice(0, point.offset)
            .reduce((sum, child) => sum + child.getTextContentSize(), 0)
        : 0;
  while (node !== source) {
    for (const sibling of node.getPreviousSiblings()) result += sibling.getTextContentSize();
    node = node.getParentOrThrow();
  }
  return result;
}
