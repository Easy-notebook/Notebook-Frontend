import {
  isAgentVisualKind,
  initialAgentVisualSource,
} from '../../../AgentVisuals/AgentVisualDocument';
import { $createAgentVisualization } from '../model/AgentVisualizationNode';
import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isParagraphNode,
  $isTextNode,
  KEY_ENTER_COMMAND,
  KEY_BACKSPACE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $createParagraphNode,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { $convertToMarkdownString } from '@lexical/mdast';
import { normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { FencedCodeSourceNode, $createFencedCodeSource } from '../model/FencedCodeSource';
import { $cellAncestor } from '../model/NotebookDocument';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import type { NotebookEditorSession } from '../interaction/NotebookEditorSession';
export function registerFenceInput(editor: LexicalEditor, session: NotebookEditorSession) {
  const convertFence = (event: KeyboardEvent | null = null) => {
    if (!editor.isEditable() || editor.isComposing() || event?.shiftKey) return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const anchor = selection.anchor.getNode();
    const paragraph = $isParagraphNode(anchor) ? anchor : anchor.getParent();
    if (!$isParagraphNode(paragraph)) return false;
    const match = /^(?:`{3,}|~{3,})([\w+:-]*)[ \t]*$/.exec(paragraph.getTextContent());
    if (!match) return false;
    const cell = $cellAncestor(paragraph);
    if (!(cell instanceof NotebookCellNode) || cell.isTitle()) return false;
    if (isAgentVisualKind(match[1])) {
      event?.preventDefault();
      const node = $createAgentVisualization(match[1], initialAgentVisualSource(match[1]));
      paragraph.replace(node);
      const after = $createParagraphNode();
      node.insertAfter(after);
      after.selectStart();
      return true;
    }
    const language = normalizeCodeLanguage(match[1]);
    event?.preventDefault();
    if (paragraph.getParent() === cell) {
      session.promoteCodeFence(paragraph, language);
    } else {
      const node = $createFencedCodeSource(`\`\`\`${language}\n\n\`\`\``);
      paragraph.replace(node);
      node.selectStart();
    }
    return true;
  };
  return mergeRegister(
    editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => convertFence(),
      COMMAND_PRIORITY_CRITICAL
    ),
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      convertFence,

      COMMAND_PRIORITY_CRITICAL
    ),
    editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event) => {
        if (!editor.isEditable() || editor.isComposing()) return false;
        const selection = $getSelection();
        if (
          !$isRangeSelection(selection) ||
          !selection.isCollapsed() ||
          selection.anchor.offset !== 0
        )
          return false;
        const anchor = selection.anchor.getNode();
        const node = anchor instanceof FencedCodeSourceNode ? anchor : anchor.getParent();
        if (
          !(node instanceof FencedCodeSourceNode) ||
          ($isTextNode(anchor) && node.getFirstDescendant() !== anchor)
        )
          return false;
        const cell = $cellAncestor(node);
        if (!(cell instanceof NotebookCellNode)) return false;
        const original = session.cell(cell.getCellId());
        if (!original) return false;
        const source = node.getSource();
        const match = /^( {0,3})(`{3,}|~{3,})/.exec(source);
        if (!match) return false;
        // The source exporter owns container prefixes, so serialize the selected node's
        // shortened delimiter in place before transferring the cell to literal mode.
        node.shortenOpeningFence();
        const content = $convertToMarkdownString(cell);
        session.replace({
          ...original,
          type: 'markdown',
          content,
          metadata: { ...original.metadata, editorMode: 'source' },
        });
        event?.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    ),
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event || !(event.metaKey || event.ctrlKey) || !editor.isEditable()) return false;
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;
        let node = selection.anchor.getNode();
        while (node.getParent() && !(node instanceof FencedCodeSourceNode))
          node = node.getParent()!;
        if (!(node instanceof FencedCodeSourceNode)) return false;
        const paragraph = $createParagraphNode();
        node.insertAfter(paragraph);
        paragraph.selectStart();
        event.preventDefault();
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    )
  );
}
export function FenceInputPlugin() {
  const [editor] = useLexicalComposerContext();
  const session = useNotebookEditorSession();
  useEffect(() => registerFenceInput(editor, session), [editor, session]);
  return null;
}
