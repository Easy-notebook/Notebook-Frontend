import { $getSelection, $isRangeSelection, $isNodeSelection, type LexicalEditor } from 'lexical';
import { $cellAncestor } from '../model/NotebookDocument';
import { agentWriting } from '@Services/agent-writing/AgentWriting';

/** Capture native mutations before Lexical handles them; transaction validation is the final boundary. */
export function registerAgentEditGuard(editor: LexicalEditor, notebookId: string | null) {
  const blocked = () =>
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) return false;
      const ids = selection.getNodes().map((node) => $cellAncestor(node)?.getCellId());
      if ($isRangeSelection(selection))
        ids.push(
          $cellAncestor(selection.anchor.getNode())?.getCellId(),
          $cellAncestor(selection.focus.getNode())?.getCellId()
        );
      return ids.some((id) => id && agentWriting.forCell(notebookId, id));
    });
  const prevent = (event: Event) => {
    const root = editor.getRootElement();
    const target = event.target instanceof Element ? event.target : null;
    const source = target?.closest('.cm-editor, textarea, input');
    const sourceId = source?.closest<HTMLElement>('[data-cell-id]')?.dataset.cellId;
    const native = root?.ownerDocument.getSelection();
    const inRoot = native?.anchorNode && root?.contains(native.anchorNode);
    const intersects =
      inRoot && native.rangeCount > 0
        ? Array.from(root!.children).some((element) => {
            const id = (element as HTMLElement).dataset.cellId;
            return (
              id &&
              agentWriting.forCell(notebookId, id) &&
              native.getRangeAt(0).intersectsNode(element)
            );
          })
        : blocked();
    if (source ? !!sourceId && !!agentWriting.forCell(notebookId, sourceId) : intersects) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const key = (event: KeyboardEvent) => {
    if (['Backspace', 'Delete', 'Enter', 'Tab'].includes(event.key)) prevent(event);
    else if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase()))
      prevent(event);
  };
  const bind = (root: HTMLElement | null, add: boolean) => {
    if (!root) return;
    for (const name of ['beforeinput', 'paste', 'cut', 'drop']) {
      if (add) root.addEventListener(name, prevent, true);
      else root.removeEventListener(name, prevent, true);
    }
    if (add) root.addEventListener('keydown', key, true);
    else root.removeEventListener('keydown', key, true);
  };
  const detach = editor.registerRootListener((root, previous) => {
    bind(previous, false);
    bind(root, true);
  });
  return () => {
    bind(editor.getRootElement(), false);
    detach();
  };
}
