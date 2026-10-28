import { describe, it, expect } from 'vitest';
import { buildEditorFromExtensions } from '@lexical/extension';
import { $getRoot } from 'lexical';
import { $convertToMarkdownString } from '@lexical/mdast';
import { createNotebookExtension } from './NotebookDocument';
import { NotebookPluginRegistry } from '../extensionPoints';
import { FencedCodeSourceExtension } from './FencedCodeSource';
import { AgentVisualizationNode } from './AgentVisualizationNode';
import type { NotebookCellNode } from './NotebookCellNode';
describe('agent custom Markdown blocks', () => {
  it.each(['agent-tree', 'agent-lanes'])('imports and exports editable %s source', (kind) => {
    const source = JSON.stringify(
      kind === 'agent-tree'
        ? { root: { id: 'a', name: 'Agent', task: 'work', status: 'queued' } }
        : { agents: [{ id: 'a', name: 'Agent' }], tasks: [] }
    );
    const cell = {
      id: 'body',
      type: 'markdown' as const,
      content: '```' + kind + '\n' + source + '\n```',
    };
    const registry = new NotebookPluginRegistry([
      { id: 'fences', extensions: [FencedCodeSourceExtension] },
    ]);
    const editor = buildEditorFromExtensions(createNotebookExtension([cell], false, registry));
    editor.update(() => {}, { discrete: true });
    editor.update(
      () => {
        const wrapper = $getRoot().getFirstChild() as NotebookCellNode;
        const node = wrapper.getFirstChild();
        expect(node).toBeInstanceOf(AgentVisualizationNode);
        (node as AgentVisualizationNode).setSource(source.replace('Agent', 'Edited'));
        expect($convertToMarkdownString(wrapper)).toContain('Edited');
        expect($convertToMarkdownString(wrapper)).toContain('```' + kind);
      },
      { discrete: true }
    );
    editor.dispose();
  });
});
