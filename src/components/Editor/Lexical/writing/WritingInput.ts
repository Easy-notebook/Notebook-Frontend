import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isElementNode,
  $getNodeByKey,
  KEY_DOWN_COMMAND,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  $addUpdateTag,
  KEY_BACKSPACE_COMMAND,
  $createParagraphNode,
  type LexicalEditor,
} from 'lexical';
import { $isLinkNode } from '@lexical/link';
import { $createHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { mergeRegister } from '@lexical/utils';
import { $cellAncestor } from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';
export const WRITING_PAIRS: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  '（': '）',
  '【': '】',
  '《': '》',
  '「': '」',
  '『': '』',
  '“': '”',
  '‘': '’',
};
type Pair = { key: string; offset: number; closer: string; source: string };
/** Only generated closing characters can be stepped over; authored punctuation stays authored. */
export function registerWritingInput(editor: LexicalEditor) {
  let pairs: Pair[] = [];
  const eligible = () => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const node = selection.anchor.getNode();
    if (
      !$isTextNode(node) ||
      node.hasFormat('code') ||
      $isLinkNode(node.getParent()) ||
      !($cellAncestor(node) instanceof NotebookCellNode)
    )
      return null;
    return { selection, node };
  };
  return mergeRegister(
    editor.registerUpdateListener(({ editorState, tags }) => {
      if (tags.has('historic') || tags.has('external-notebook-sync')) {
        pairs = [];
        return;
      }
      editorState.read(() => {
        pairs = pairs.flatMap((pair) => {
          const node = $getNodeByKey(pair.key);
          if (!$isTextNode(node)) return [];
          const next = node.getTextContent(),
            old = pair.source;
          if (next === old) return [pair];
          let prefix = 0;
          while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix])
            prefix++;
          let suffix = 0;
          while (
            suffix < old.length - prefix &&
            suffix < next.length - prefix &&
            old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
          )
            suffix++;
          if (pair.offset >= old.length - suffix) pair.offset += next.length - old.length;
          else if (pair.offset >= prefix) return [];
          pair.source = next;
          return next[pair.offset] === pair.closer ? [pair] : [];
        });
      });
    }),
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        if (
          !editor.isEditable() ||
          editor.isComposing() ||
          event?.isComposing ||
          event?.metaKey ||
          event?.ctrlKey ||
          event?.altKey
        )
          return false;
        const state = eligible();
        if (!state || !state.selection.isCollapsed()) return false;
        const offset = state.selection.anchor.offset;
        const pair = pairs.find(
          (p) =>
            p.key === state.node.getKey() &&
            p.offset === offset &&
            WRITING_PAIRS[state.node.getTextContent()[offset - 1]] === p.closer
        );
        if (!pair) return false;
        event?.preventDefault();
        $addUpdateTag(HISTORY_PUSH_TAG);
        state.node.spliceText(offset - 1, 2, '');
        state.node.select(offset - 1, offset - 1);
        pairs = pairs.filter((p) => p !== pair);
        return true;
      },
      COMMAND_PRIORITY_HIGH
    ),
    editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (!editor.isEditable() || editor.isComposing() || event.isComposing) return false;
        const selection = $getSelection();
        if (
          (event.metaKey || event.ctrlKey) &&
          event.altKey &&
          /^[0-6]$/.test(event.key) &&
          $isRangeSelection(selection)
        ) {
          const cell = $cellAncestor(selection.anchor.getNode());
          if (!(cell instanceof NotebookCellNode) || cell.isTitle()) return false;
          event.preventDefault();
          $addUpdateTag(HISTORY_PUSH_TAG);
          $setBlocksType(selection, () =>
            event.key === '0'
              ? $createParagraphNode()
              : $createHeadingNode(`h${event.key}` as HeadingTagType)
          );
          return true;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return false;
        if (
          WRITING_PAIRS[event.key] &&
          $isRangeSelection(selection) &&
          selection.isCollapsed() &&
          selection.anchor.type === 'element'
        ) {
          const node = selection.anchor.getNode();
          if (
            $isElementNode(node) &&
            node.getChildrenSize() === 0 &&
            $cellAncestor(node) instanceof NotebookCellNode
          ) {
            event.preventDefault();
            $addUpdateTag(HISTORY_PUSH_TAG);
            selection.insertText(event.key + WRITING_PAIRS[event.key]);
            const text = selection.anchor.getNode();
            if ($isTextNode(text)) {
              text.select(1, 1);
              pairs.push({
                key: text.getKey(),
                offset: 1,
                closer: WRITING_PAIRS[event.key],
                source: text.getTextContent(),
              });
            }
            return true;
          }
        }
        const state = eligible();
        if (!state) return false;
        const { node, selection: range } = state;
        const offset = range.anchor.offset;
        if (range.isCollapsed()) {
          const existing = pairs.find(
            (p) => p.key === node.getKey() && p.offset === offset && p.closer === event.key
          );
          if (existing) {
            event.preventDefault();
            node.select(offset + 1, offset + 1);
            pairs = pairs.filter((p) => p !== existing);
            return true;
          }
        }
        const closer = WRITING_PAIRS[event.key];
        if (!closer) return false;
        if (range.anchor.key !== range.focus.key) return false;
        const start = Math.min(range.anchor.offset, range.focus.offset),
          end = Math.max(range.anchor.offset, range.focus.offset),
          text = node.getTextContent();
        if (
          range.isCollapsed() &&
          (/[\p{L}\p{N}_]/u.test(text[start] ?? '') ||
            (event.key === "'" && /[\p{L}\p{N}]/u.test(text[start - 1] ?? '')) ||
            /(?:https?:\/\/|www\.)\S*$/i.test(text.slice(0, start)))
        )
          return false;
        event.preventDefault();
        $addUpdateTag(HISTORY_PUSH_TAG);
        node.spliceText(start, end - start, event.key + text.slice(start, end) + closer);
        node.select(start + 1, end + 1);
        pairs.push({ key: node.getKey(), offset: end + 1, closer, source: node.getTextContent() });
        return true;
      },
      COMMAND_PRIORITY_HIGH
    )
  );
}
