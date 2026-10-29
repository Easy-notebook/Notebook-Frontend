import { markdownTriggers } from './MarkdownTriggers';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { MarkdownSourceBlockNode, type SourceBlockKind } from '../model/MarkdownSourceBlockNode';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';
import { $getExtensionOutput } from '@lexical/extension';
import { MdastImportExtension } from '@lexical/mdast';
import {
  $createTextNode,
  $getSelection,
  $setSelection,
  $isRangeSelection,
  $isTextNode,
  type TextFormatType,
  type LexicalNode,
} from 'lexical';
import { MarkdownSourceNode } from '../model/MarkdownSourceNode';
import { $sourceAncestor, $sourceOffset } from './InlineMarkdownSource';

/** Re-parse active source with the notebook grammar; syntax remains real editable text. */
export function $previewSource(source: MarkdownSourceNode) {
  const value = source.getTextContent();
  const registry = $getExtensionOutput(MdastImportExtension).registry;
  const tree = fromMarkdown(value, {
    extensions: registry.micromarkExtensions,
    mdastExtensions: registry.mdastExtensions,
  });
  const block = source.getParent();
  let blockChanged = false;
  if (block instanceof MarkdownSourceBlockNode) {
    const first = tree.children.length === 1 ? tree.children[0] : null;
    const kind: SourceBlockKind =
      first?.type === 'heading'
        ? `h${first.depth}`
        : first?.type === 'blockquote'
          ? 'quote'
          : first?.type === 'list'
            ? first.ordered
              ? 'number'
              : 'bullet'
            : 'paragraph';
    blockChanged = block.getKind() !== kind;
    block.setKind(kind);
  }
  const links: { start: number; end: number; url: string; title: string | null }[] = [];
  const spans: { start: number; end: number; formats: TextFormatType[] }[] = [];
  const visit = (node: Nodes, inherited: TextFormatType[] = []) => {
    const format: TextFormatType | undefined =
      node.type === 'strong'
        ? 'bold'
        : node.type === 'emphasis'
          ? 'italic'
          : node.type === 'delete'
            ? 'strikethrough'
            : node.type === 'link'
              ? 'underline'
              : undefined;
    if (node.type === 'link' && node.children.length) {
      const first = node.children[0];
      const last = node.children[node.children.length - 1];
      const start = 'position' in first ? first.position?.start.offset : undefined;
      const end = 'position' in last ? last.position?.end.offset : undefined;
      if (start !== undefined && end !== undefined)
        links.push({ start, end, url: node.url, title: node.title ?? null });
    }
    const formats = format ? [...inherited, format] : inherited;
    if (node.type === 'inlineCode' && node.position) {
      const start = node.position.start.offset!,
        end = node.position.end.offset!;
      const fence = /^`+/.exec(value.slice(start))?.[0].length ?? 1;
      spans.push({ start: start + fence, end: end - fence, formats: [...formats, 'code'] });
    } else if ('children' in node) {
      for (const child of node.children) visit(child as Nodes, formats);
    } else if (formats.length && 'position' in node && node.position) {
      spans.push({ start: node.position.start.offset!, end: node.position.end.offset!, formats });
    }
  };
  visit(tree);
  const markers = markdownTriggers(value).map((marker) =>
    marker.kind === 'block'
      ? { ...marker, end: marker.end + (/^[ \t]+/.exec(value.slice(marker.end))?.[0].length ?? 0) }
      : marker
  );
  const boundaries = [
    ...new Set([
      0,
      value.length,
      ...markers.flatMap((marker) => [marker.start, marker.end]),
      ...spans.flatMap((span) => [span.start, span.end]),
      ...links.flatMap((link) => [link.start, link.end]),
    ]),
  ].sort((a, b) => a - b);
  const segments = boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1];
    const text = $createTextNode(value.slice(start, end));
    if (markers.some((marker) => start >= marker.start && end <= marker.end))
      text.setStyle(
        'color: var(--editor-syntax-marker, #9ca3af); font-size: 0.82em; font-weight: 400;'
      );
    for (const format of new Set(
      spans.filter((span) => start >= span.start && end <= span.end).flatMap((span) => span.formats)
    ))
      text.toggleFormat(format);
    return text;
  });
  const previous = source.getAllTextNodes();
  const linksForSegments = boundaries
    .slice(0, -1)
    .map((start, i) => links.find((link) => start >= link.start && boundaries[i + 1] <= link.end));
  const unchanged =
    previous.length === segments.length &&
    previous.every(
      (node, i) =>
        $isTextNode(node) &&
        node.getTextContent() === segments[i].getTextContent() &&
        node.getFormat() === segments[i].getFormat() &&
        node.getStyle() === segments[i].getStyle() &&
        ($isLinkNode(node.getParent())
          ? node.getParent()!.getType() === 'link' &&
            (node.getParent() as ReturnType<typeof $createLinkNode>).getURL()
          : undefined) === linksForSegments[i]?.url
    );
  if (unchanged || !segments.length) {
    const selection = $getSelection();
    if (blockChanged && $isRangeSelection(selection)) $setSelection(selection.clone());
    return;
  }
  const currentSelection = $getSelection();
  const selection = $isRangeSelection(currentSelection)
    ? currentSelection.clone()
    : currentSelection;
  const anchor =
    $isRangeSelection(selection) && $sourceAncestor(selection.anchor.getNode()) === source
      ? $sourceOffset(source, selection.anchor)
      : null;
  const focus =
    $isRangeSelection(selection) && $sourceAncestor(selection.focus.getNode()) === source
      ? $sourceOffset(source, selection.focus)
      : null;
  const children: LexicalNode[] = [];
  let lastLink: ReturnType<typeof $createLinkNode> | null = null;
  let lastRange: (typeof links)[number] | undefined;
  segments.forEach((text, i) => {
    const link = linksForSegments[i];
    if (link) {
      if (link !== lastRange) {
        lastLink = $createLinkNode(link.url, { title: link.title });
        children.push(lastLink);
      }
      lastLink!.append(text);
    } else children.push(text);
    lastRange = link;
  });
  source.splice(0, source.getChildrenSize(), children);
  if ($isRangeSelection(selection)) {
    for (const [point, offset] of [
      [selection.anchor, anchor],
      [selection.focus, focus],
    ] as const) {
      if (offset === null) continue;
      let remaining = offset;
      for (const text of segments) {
        const length = text.getTextContentSize();
        if (remaining <= length || text === segments[segments.length - 1]) {
          point.set(text.getKey(), Math.min(remaining, length), 'text');
          break;
        }
        remaining -= length;
      }
    }
    // Typed characters derive their style from the next parse, never from a stale rich-text format.
    selection.setFormat(0);
    selection.setStyle('');
    $setSelection(selection);
  }
}
