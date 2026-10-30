import { afterEach, expect, it } from 'vitest';
import { buildEditorFromExtensions } from '@lexical/extension';
import { $getRoot, type ElementNode, HISTORIC_TAG } from 'lexical';
import { createNotebookExtension, $readCells } from './NotebookDocument';
import { NotebookPluginRegistry } from '../extensionPoints';
import { NotebookEditorSession } from '../interaction/NotebookEditorSession';
import useStore from '@Store/notebookStore';
import { useNotebookConversation } from '@Services/agent-cell/NotebookConversation';
import { useAIAgentStore } from '@Store/AIAgentStore';
import type { Cell } from '@Store/models';
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
const body: Cell = { id: 'body', type: 'markdown', content: 'Article' };
const conversation: Cell = { id: 'chat', type: 'agent', content: 'Write the article' };
function setup(cells: Cell[]) {
  useStore.setState({ notebookId: 'projection', cells, isInitialized: false });
  const editor = buildEditorFromExtensions(
    createNotebookExtension(cells, false, new NotebookPluginRegistry([]))
  );
  editor.update(() => {}, { discrete: true });
  const session = new NotebookEditorSession(editor, 'projection');
  cleanups.push(session.attach(), () => editor.dispose());
  const visible = () =>
    editor.getEditorState().read(() => $readCells((id) => session.cell(id)), { editor });
  return { editor, session, visible };
}
it('loads only article content and preserves conversations through body deletion and history restoration', () => {
  const { editor, visible } = setup([body, conversation]);
  expect(visible().map((cell) => cell.id)).toEqual(['body']);
  const before = editor.getEditorState();
  editor.update(() => $getRoot().clear(), { discrete: true });
  expect(useStore.getState().cells).toEqual(
    expect.arrayContaining([expect.objectContaining(conversation)])
  );
  editor.setEditorState(before, { tag: HISTORIC_TAG });
  expect(useStore.getState().cells).toMatchObject([body, conversation]);
  expect(visible().map((cell) => cell.id)).toEqual(['body']);
});
it('does not insert externally created conversations into the article and retains live updates on edits', () => {
  const { editor, visible } = setup([body]);
  useStore.getState().setCells([body, conversation]);
  expect(visible().map((cell) => cell.id)).toEqual(['body']);
  const updated = { ...conversation, content: 'Updated request' };
  useStore.getState().setCells([body, updated]);
  editor.update(
    () => ($getRoot().getFirstChildOrThrow() as ElementNode).selectEnd().insertText('!'),
    { discrete: true }
  );
  expect(useStore.getState().cells.find((cell) => cell.id === 'chat')).toMatchObject(updated);
  expect(visible()[0].content).toBe('Article!');
});
it('routes the agent insertion command to the demand panel without leaving a document block', async () => {
  const { session, visible } = setup([body]);
  useStore.setState({ isRightSidebarCollapsed: true });
  session.insert(conversation);
  await Promise.resolve();
  expect(visible().map((cell) => cell.id)).toEqual(['body']);
  expect(useStore.getState().cells).toEqual(
    expect.arrayContaining([expect.objectContaining(conversation)])
  );
  expect(useNotebookConversation.getState().selected.projection).toBe('chat');
  expect(useAIAgentStore.getState().activeView).toBe('qa');
  expect(useStore.getState().isRightSidebarCollapsed).toBe(false);
});
