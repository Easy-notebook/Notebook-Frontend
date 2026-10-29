import {
  $getRoot,
  $getNodeByKey,
  $isTextNode,
  $createRangeSelection,
  $setSelection,
  HISTORY_PUSH_TAG,
  type TextNode,
} from 'lexical';
import type { NotebookEditorSession } from '../interaction/NotebookEditorSession';
import { $cellAncestor } from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';
export type FindOptions = { query: string; matchCase: boolean; wholeWord: boolean };
export type FindMatch = {
  startKey: string;
  start: number;
  endKey: string;
  end: number;
  text: string;
};

/** Search rendered prose across formatting runs, never execution output or agent transcripts. */
export function $findMatches(options: FindOptions): FindMatch[] {
  if (!options.query) return [];
  const groups = new Map<string, TextNode[]>();
  for (const node of $getRoot().getAllTextNodes()) {
    if (!($cellAncestor(node) instanceof NotebookCellNode)) continue;
    let parent = node.getParentOrThrow();
    while (parent.isInline() && parent.getParent()) parent = parent.getParentOrThrow();
    const group = groups.get(parent.getKey()) ?? [];
    group.push(node);
    groups.set(parent.getKey(), group);
  }
  const matches: FindMatch[] = [];
  const escaped = options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(escaped, options.matchCase ? 'gu' : 'giu');
  for (const nodes of groups.values()) {
    const text = nodes.map((n) => n.getTextContent()).join('');
    const point = (offset: number, end = false) => {
      let rest = offset;
      for (const node of nodes) {
        const length = node.getTextContentSize();
        if (rest < length || (end && rest === length)) return { key: node.getKey(), offset: rest };
        rest -= length;
      }
      const node = nodes[nodes.length - 1];
      return { key: node.getKey(), offset: node.getTextContentSize() };
    };
    for (const match of text.matchAll(expression)) {
      const start = match.index!;
      const end = start + match[0].length;
      if (
        options.wholeWord &&
        (/\p{L}|\p{N}|_/u.test(text[start - 1] ?? '') || /\p{L}|\p{N}|_/u.test(text[end] ?? ''))
      )
        continue;
      const a = point(start),
        b = point(end, true);
      matches.push({
        startKey: a.key,
        start: a.offset,
        endKey: b.key,
        end: b.offset,
        text: match[0],
      });
    }
  }
  return matches;
}
function $selectMatch(match: FindMatch) {
  const a = $getNodeByKey(match.startKey),
    b = $getNodeByKey(match.endKey);
  if (!$isTextNode(a) || !$isTextNode(b)) return null;
  const selection = $createRangeSelection();
  selection.setTextNodeRange(a, match.start, b, match.end);
  if (selection.getTextContent() !== match.text) return null;
  $setSelection(selection);
  return selection;
}
export class FindController {
  constructor(private readonly session: NotebookEditorSession) {}
  find(options: FindOptions) {
    return this.session.editor.read(() => $findMatches(options));
  }
  select(match: FindMatch) {
    if (!this.session.owns()) return;
    this.session.editor.update(() => $selectMatch(match), { discrete: true });
    this.session.editor.getElementByKey(match.startKey)?.scrollIntoView({ block: 'nearest' });
  }
  replace(options: FindOptions, replacement: string, index?: number) {
    if (!this.session.owns() || !this.session.editor.isEditable()) return;
    this.session.editor.update(
      () => {
        const matches = $findMatches(options);
        const targets = index === undefined ? matches : [matches[index]].filter(Boolean);
        for (const match of targets.reverse()) $selectMatch(match)?.insertText(replacement);
      },
      { discrete: true, tag: HISTORY_PUSH_TAG }
    );
  }
}
