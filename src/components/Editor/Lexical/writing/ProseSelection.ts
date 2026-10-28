import { $isTextNode, type RangeSelection } from 'lexical';

/** Exclude empty boundary slices so replacing a paragraph's text cannot join its heading. */
export function $textBoundedSelection(selection: RangeSelection): RangeSelection | null {
  const backward = selection.isBackward();
  const start = backward ? selection.focus : selection.anchor;
  const end = backward ? selection.anchor : selection.focus;
  const slices = selection
    .getNodes()
    .filter($isTextNode)
    .map((node) => ({
      node,
      start: node.getKey() === start.key && start.type === 'text' ? start.offset : 0,
      end:
        node.getKey() === end.key && end.type === 'text' ? end.offset : node.getTextContentSize(),
    }))
    .filter((slice) => slice.end > slice.start);
  if (!slices.length) return null;
  const first = slices[0],
    last = slices[slices.length - 1];
  const bounded = selection.clone();
  bounded.setTextNodeRange(first.node, first.start, last.node, last.end);
  return bounded;
}
