import { Fragment, type Node } from '@tiptap/pm/model';
import type { Cell } from '@Store/models';
import { createMarkdownParser } from '../../utils/inlineMarkdown';
import { headingSlug, nextHeadingOccurrence } from '@Utils/markdown/headingIdentity';

interface Heading {
  node: Node;
  key: string;
}
const entries = new WeakMap<Node, { source: string; headings: Heading[] }>();

/** Resolve phase-wide identities without reparsing unchanged cell HTML or replacing its views. */
export function projectHeadingIdentities(
  block: Node,
  cell: Cell,
  counters: Map<string, Map<string, number>>
): Node {
  if (block.type.name !== 'markdownCell') return block;
  let entry = entries.get(block);
  if (!entry || entry.source !== cell.content) {
    const nodes: Node[] = [];
    block.descendants((node) => {
      if (node.type.name === 'heading') nodes.push(node);
    });
    const texts: string[] = [];
    if (nodes.length) {
      const visit = (tokens: any[]) => {
        for (const token of tokens) {
          if (token.type === 'heading') texts.push(token.text);
          else if (token.type === 'blockquote') visit(token.tokens);
          else if (token.type === 'list') for (const item of token.items) visit(item.tokens);
        }
      };
      visit(createMarkdownParser().lexer(cell.content));
    }
    entry = {
      source: cell.content,
      headings: nodes.map((node, index) => ({
        node,
        key: headingSlug(texts[index] ?? node.textContent),
      })),
    };
    entries.set(block, entry);
  }
  const base = cell.phaseId || cell.id;
  const phaseChanged = (block.attrs.phaseId || null) !== (cell.phaseId || null);
  const replacements = new Map<Node, Node>();
  for (const heading of entry.headings) {
    let id = base;
    if (heading.node.attrs.level >= 3) {
      let counts = counters.get(base);
      if (!counts) {
        counts = new Map();
        counters.set(base, counts);
      }
      id = `${base}--${nextHeadingOccurrence(heading.key, counts).key}`;
    }
    if (heading.node.attrs.id !== id)
      replacements.set(
        heading.node,
        heading.node.type.create(
          { ...heading.node.attrs, id },
          heading.node.content,
          heading.node.marks
        )
      );
  }
  if (!replacements.size && !phaseChanged) return block;
  const rewrite = (node: Node): Node => {
    const replacement = replacements.get(node);
    if (replacement) return replacement;
    if (node.isLeaf) return node;
    const children: Node[] = [];
    let changed = false;
    node.forEach((child) => {
      const next = rewrite(child);
      children.push(next);
      changed ||= next !== child;
    });
    return changed ? node.copy(Fragment.fromArray(children)) : node;
  };
  const rewritten = replacements.size ? rewrite(block) : block;
  const result = phaseChanged
    ? block.type.create(
        { ...block.attrs, phaseId: cell.phaseId || null },
        rewritten.content,
        block.marks
      )
    : rewritten;
  entries.set(result, {
    source: entry.source,
    headings: entry.headings.map((heading) => ({
      ...heading,
      node: replacements.get(heading.node) ?? heading.node,
    })),
  });
  return result;
}
