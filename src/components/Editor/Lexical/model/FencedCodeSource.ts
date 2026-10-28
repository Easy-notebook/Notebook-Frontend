import { AgentVisualizationNode, $createAgentVisualization } from './AgentVisualizationNode';
import { isAgentVisualKind } from '../../../AgentVisuals/AgentVisualDocument';
import {
  $applyNodeReplacement,
  $copyNode,
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getState,
  $setState,
  configExtension,
  createState,
  defineExtension,
  type EditorConfig,
  type NodeKey,
  type RangeSelection,
} from 'lexical';
import { CodeNode, type SerializedCodeNode } from '@lexical/code-core';
import {
  $convertToMarkdownString,
  MdastCodeExtension,
  MdastImportExtension,
  type MdastConfig,
} from '@lexical/mdast';
import type { Code, Literal } from 'mdast';

interface FencedSourceAst extends Literal {
  type: 'notebookFencedSource';
}
declare module 'mdast' {
  interface BlockContentMap {
    notebookFencedSource: FencedSourceAst;
  }
  interface RootContentMap {
    notebookFencedSource: FencedSourceAst;
  }
}

type FenceLayout = {
  header: string;
  language: string;
  closing: string | null;
  tail: string;
  emptySeparator: string;
  openingSeparator: string;
};
const fenceLayout = createState('notebookFenceLayout', {
  parse: (value): FenceLayout | null => {
    if (!value || typeof value !== 'object') return null;
    const data = value as FenceLayout;
    return typeof data.header === 'string' &&
      typeof data.language === 'string' &&
      (data.closing === null || typeof data.closing === 'string') &&
      typeof data.tail === 'string' &&
      typeof data.emptySeparator === 'string' &&
      typeof data.openingSeparator === 'string'
      ? data
      : null;
  },
});
export function parseCodeFence(source: string) {
  const newline = source.indexOf('\n');
  const header = newline < 0 ? source : source.slice(0, newline);
  const match = header.match(/^ {0,3}(`{3,}|~{3,})([^\r]*)\r?$/);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  const language = match[2].trim().split(/\s+/)[0] || '';
  const rest = newline < 0 ? '' : source.slice(newline + 1);
  const closingPattern = new RegExp(
    '(^|\\n)( {0,3}' + match[1][0] + '{' + match[1].length + ',}[ \t]*)(\\r?\\n[\\s\\S]*)?$'
  );
  const closing = rest.match(closingPattern);
  return {
    body: closing ? rest.slice(0, closing.index) : rest,
    layout: {
      header,
      language,
      closing: closing?.[2] ?? null,
      tail: closing?.[3] ?? '',
      emptySeparator: closing?.[1] ?? '',
      openingSeparator: newline < 0 ? '' : '\n',
    } satisfies FenceLayout,
  };
}

/** The code body is the native editable content. Delimiters are persisted source
 * metadata, never editable DOM lines that displace the caret or get repaired. */
export class FencedCodeSourceNode extends CodeNode {
  static getType() {
    return 'fenced-code-source';
  }
  static clone(node: FencedCodeSourceNode) {
    return new FencedCodeSourceNode(undefined, node.__key);
  }
  static importJSON(data: SerializedCodeNode) {
    return new FencedCodeSourceNode().updateFromJSON(data);
  }
  constructor(language?: string, key?: NodeKey) {
    super(language, key);
  }
  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.classList.add('lexical-fenced-source');
    return element;
  }
  exportJSON(): SerializedCodeNode {
    return { ...super.exportJSON(), type: FencedCodeSourceNode.getType(), version: 2 };
  }
  exportDOM() {
    const element = document.createElement('pre');
    element.dataset.type = 'fenced-code-source';
    const code = document.createElement('code');
    code.textContent = this.getSource();
    element.append(code);
    return { element };
  }
  insertNewAfter(selection: RangeSelection): null {
    selection.insertLineBreak();
    return null;
  }
  collapseAtStart() {
    return false;
  }
  shortenOpeningFence() {
    const layout = $getState(this, fenceLayout);
    const opener = layout?.header.match(/^( {0,3})(`{3,}|~{3,})/);
    if (!layout || !opener) return false;
    const offset = opener[0].length - 1;
    $setState(this, fenceLayout, {
      ...layout,
      header: layout.header.slice(0, offset) + layout.header.slice(offset + 1),
    });
    return true;
  }
  getSource() {
    const layout = $getState(this, fenceLayout);
    if (!layout) throw new Error('Code fence metadata is missing');
    const language = this.getLanguage() || '';
    const header =
      language === layout.language
        ? layout.header
        : layout.header.replace(/^([ \t]*(?:`{3,}|~{3,}))[ \t]*\S*/, '$1' + language);
    const body = this.getTextContent();
    return (
      header +
      (layout.openingSeparator || (body ? '\n' : '')) +
      body +
      (layout.closing === null
        ? ''
        : (body ? '\n' : layout.emptySeparator) + layout.closing + layout.tail)
    );
  }
}

export function $createFencedCodeSource(source: string) {
  const parsed = parseCodeFence(source);
  if (!parsed) throw new Error('Invalid code fence opener');
  const node = $applyNodeReplacement(new FencedCodeSourceNode(parsed.layout.language));
  $setState(node, fenceLayout, parsed.layout);
  parsed.body.split('\n').forEach((line, index) => {
    if (index) node.append($createLineBreakNode());
    if (line) node.append($createTextNode(line));
  });
  return node;
}

export function $codeFenceSource(node: CodeNode) {
  if (node instanceof FencedCodeSourceNode) return node.getSource();
  // CodeNode owns a flat sequence of text/tab/line-break children. $copyNode
  // copies only the node itself; serialize a populated copy so edited/typed
  // code never loses its body when revealing the fences.
  const copy = $copyNode(node, true).append(
    ...node.getChildren().map((child) => $copyNode(child, true))
  );
  const container = $createParagraphNode().append(copy);
  return $convertToMarkdownString(container);
}

// Compose the import rule contributed by the public code extension. Both
// document import and Enter shortcuts consume the canonical CommonMark AST;
// source/preview ownership is decided here, never by rewriting its code type.
// Delegating preserves the upstream codec's fence and metadata semantics.
const standardCodeRule = (MdastCodeExtension.dependencies || [])
  .flatMap((dependency) =>
    Array.isArray(dependency) && dependency[0] === MdastImportExtension
      ? (dependency[1] as Partial<MdastConfig>).importRules || []
      : []
  )
  .find((rule) => rule.type === 'code');
if (!standardCodeRule) throw new Error('MdastCodeExtension must provide its code import rule');
const standardCodeImport = standardCodeRule.$import;

export const FencedCodeSourceExtension = defineExtension({
  name: 'notebook/fenced-code-source',
  nodes: [FencedCodeSourceNode, AgentVisualizationNode],
  dependencies: [
    MdastCodeExtension,
    configExtension(MdastImportExtension, {
      importRules: [
        {
          type: 'code',
          $import: (node, context) => {
            const ast = node as Code;
            const start = ast.position?.start.offset,
              end = ast.position?.end.offset;
            let literal = context.source.slice(start, end);
            // Remove only enclosing list/quote prefixes; those containers own them.
            const indent = (ast.position?.start.column || 1) - 1;
            if (indent)
              literal = literal
                .split('\n')
                .map((line, i) =>
                  i ? line.replace(new RegExp(`^[ >\\t]{0,${indent}}`), '') : line
                )
                .join('\n');
            if (end !== undefined && /^[\r\n]+$/.test(context.source.slice(end)))
              literal += context.source.slice(end);
            if (isAgentVisualKind(ast.lang || ''))
              return $createAgentVisualization(ast.lang as 'agent-tree' | 'agent-lanes', ast.value);
            if (parseCodeFence(literal)) {
              return $createFencedCodeSource(literal);
            }
            // Indented code belongs to the standard codec.
            return standardCodeImport(ast, context);
          },
        },
      ],
      exportRules: [
        {
          type: AgentVisualizationNode.getType(),
          $export: (node) => ({
            type: 'notebookFencedSource',
            value: (node as AgentVisualizationNode).getTextContent(),
          }),
        },
        {
          type: FencedCodeSourceNode.getType(),
          $export: (node) => ({
            type: 'notebookFencedSource',
            value: (node as FencedCodeSourceNode).getSource(),
          }),
        },
      ],
      toMarkdownExtensions: [{ handlers: { notebookFencedSource: (node) => node.value } }],
    }),
  ],
});
