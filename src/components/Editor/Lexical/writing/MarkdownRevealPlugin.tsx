import { useEffect } from 'react';
import { $getSelection, $isRangeSelection, $isTextNode } from 'lexical';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import { markdownTriggers } from './MarkdownTriggers';
import { $sourceAncestor } from './InlineMarkdownSource';
import { MarkdownSourceEditing } from './MarkdownSourceEditing';

export function MarkdownRevealPlugin() {
  const session = useNotebookEditorSession();
  useEffect(() => new MarkdownSourceEditing(session.editor).attach(), [session]);
  useEffect(() => {
    const name = `notebook-markers-${session.editor.getKey()}`;
    const style = document.createElement('style');
    style.textContent = `::highlight(${name}) { color:#6b7280; }`;
    document.head.append(style);
    const clear = () => CSS.highlights?.delete(name);
    const detach = session.editor.registerUpdateListener(({ editorState }) => {
      clear();
      if (!session.editor.getRootElement()?.contains(document.activeElement)) return;
      const ranges: Range[] = [];
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) return;
        const source = $sourceAncestor(node);
        const texts = source ? source.getAllTextNodes() : [node];
        const tokens = markdownTriggers(source?.getTextContent() ?? node.getTextContent());
        let offset = 0;
        for (const text of texts) {
          const dom = session.editor.getElementByKey(text.getKey())?.firstChild;
          const length = text.getTextContentSize();
          if (dom?.nodeType === Node.TEXT_NODE) {
            for (const token of tokens) {
              const start = Math.max(0, token.start - offset);
              const end = Math.min(length, token.end - offset);
              if (start >= end) continue;
              // Only the token under the caret is emphasized; all other source markers stay muted.
              if (
                source &&
                (text.getKey() !== node.getKey() ||
                  selection.anchor.offset < start ||
                  selection.anchor.offset > end)
              )
                continue;
              const range = document.createRange();
              range.setStart(dom, start);
              range.setEnd(dom, end);
              ranges.push(range);
            }
          }
          offset += length;
        }
      });
      if (typeof Highlight !== 'undefined' && CSS.highlights && ranges.length)
        CSS.highlights.set(name, new Highlight(...ranges));
    });
    return () => {
      detach();
      clear();
      style.remove();
    };
  }, [session]);
  return null;
}
