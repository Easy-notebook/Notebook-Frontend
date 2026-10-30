import { afterEach, expect, it } from 'vitest';
import { buildEditorFromExtensions } from '@lexical/extension';
import { $getRoot, type ElementNode } from 'lexical';
import { createNotebookExtension } from '../model/NotebookDocument';
import { NotebookPluginRegistry } from '../extensionPoints';
import { NotebookEditorSession } from '../interaction/NotebookEditorSession';
import { agentWriting } from '@Services/agent-writing/AgentWriting';
import useStore from '@Store/notebookStore';
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  agentWriting.snapshot().forEach((op) => agentWriting.finish(op.id));
});
it('rejects programmatic edits and cross-cell deletion without poisoning the tree; other cells stay editable', async () => {
  const cells = [
    { id: 'first', type: 'markdown' as const, content: 'Frozen' },
    { id: 'other', type: 'markdown' as const, content: 'Editable' },
  ];
  useStore.setState({ notebookId: 'guard-test', cells, isInitialized: false });
  const editor = buildEditorFromExtensions(
    createNotebookExtension(cells, false, new NotebookPluginRegistry([]))
  );
  editor.update(() => {}, { discrete: true });
  const session = new NotebookEditorSession(editor, 'guard-test');
  cleanups.push(session.attach(), () => editor.dispose());
  agentWriting.propose(
    { notebookId: 'guard-test', ownerId: 'agent', name: 'Claude', color: '#d87b59' },
    'first',
    'Rewrite'
  );
  editor.update(
    () => {
      ($getRoot().getFirstChildOrThrow() as ElementNode).getFirstChildOrThrow().remove();
    },
    { discrete: true }
  );
  await Promise.resolve();
  expect(
    editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getTextContent())
  ).toBe('Frozen');
  expect(useStore.getState().cells[0].content).toBe('Frozen');
  editor.update(() => $getRoot().clear(), { discrete: true });
  await Promise.resolve();
  expect(editor.getEditorState().read(() => $getRoot().getChildrenSize())).toBe(2);
  editor.update(
    () => {
      ($getRoot().getLastChildOrThrow() as ElementNode).selectEnd().insertText('!');
    },
    { discrete: true }
  );
  expect(useStore.getState().cells[1].content).toBe('Editable!');
  // Two synchronous invalid updates must restore the last accepted state, not the
  // intermediate invalid state from the first update listener.
  editor.update(() => ($getRoot().getFirstChildOrThrow() as ElementNode).clear(), {
    discrete: true,
  });
  editor.update(() => $getRoot().clear(), { discrete: true });
  await Promise.resolve();
  expect(
    editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getTextContent())
  ).toBe('Frozen');
  expect(
    editor.getEditorState().read(() => $getRoot().getLastChildOrThrow().getTextContent())
  ).toBe('Editable!');
});
