import { useEffect } from 'react';
import { registerCellBoundaryNavigation } from '../interaction/CellBoundaryNavigation';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $createParagraphNode,
  $isElementNode,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
} from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { Backend_BASE_URL } from '@Config/base_url';
import usePreviewStore from '@Store/previewStore';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { EmbeddedCellNode } from '../model/EmbeddedCellNode';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
export function NavigationPlugin() {
  const [editor] = useLexicalComposerContext();
  const session = useNotebookEditorSession();
  useEffect(() => {
    const focusCell = (event: Event) => {
      const { cellId, sourceCellId, direction } = (
        event as CustomEvent<{ cellId?: string; sourceCellId?: string; direction: string }>
      ).detail;
      if (!session.owns() || !editor.isEditable()) return;
      editor.getRootElement()?.focus({ preventScroll: true });
      editor.update(() => {
        const children = $getRoot().getChildren();
        let target = children.find(
          (node) =>
            (node instanceof NotebookCellNode || node instanceof EmbeddedCellNode) &&
            node.getCellId() === cellId
        );
        if (!target && sourceCellId) {
          const source = children.find(
            (node) =>
              (node instanceof NotebookCellNode || node instanceof EmbeddedCellNode) &&
              node.getCellId() === sourceCellId
          );
          target =
            (direction === 'up' ? source?.getPreviousSibling() : source?.getNextSibling()) ??
            undefined;
        }
        if ($isElementNode(target)) {
          if (direction === 'up') target.selectEnd();
          else target.selectStart();
        }
      });
    };
    window.addEventListener('markdown-cell-focus', focusCell);
    const revealHash = () => {
      if (!session.owns() || !window.location.hash) return;
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(id);
      if (target && editor.getRootElement()?.contains(target))
        target.scrollIntoView({ block: 'center' });
    };
    window.addEventListener('hashchange', revealHash);
    const frame = requestAnimationFrame(revealHash);
    const detach = mergeRegister(
      registerCellBoundaryNavigation(editor, session),
      editor.registerCommand(
        CLICK_COMMAND,
        (event) => {
          const anchor = (event.target as HTMLElement)?.closest('a');
          if (!anchor) return false;
          const href = anchor.getAttribute('href');
          if (!href) return false;
          event.preventDefault();
          // In an editable document, plain clicks place the caret. Explicit modifier clicks navigate.
          if (editor.isEditable() && !event.metaKey && !event.ctrlKey) return true;
          const notebookId = session.notebookId;
          if (!notebookId) return true;
          let path: string | undefined;
          for (const prefix of [
            `${Backend_BASE_URL.replace(/\/$/, '')}/download_file/${encodeURIComponent(notebookId)}/`,
            `${Backend_BASE_URL.replace(/\/$/, '')}/assets/${encodeURIComponent(notebookId)}/`,
          ])
            if (href.startsWith(prefix)) path = decodeURIComponent(href.slice(prefix.length));
          if (!path && !/^[a-z][a-z\d+.-]*:|^\/\//i.test(href)) path = href.replace(/^\.\//, '');
          if (path) {
            void usePreviewStore
              .getState()
              .previewFileInSplit(notebookId, path)
              .then(() => {
                if (session.owns() && usePreviewStore.getState().previewMode !== 'file')
                  usePreviewStore.getState().changePreviewMode();
              })
              .catch((error) => console.error('Notebook file preview failed', error));
          } else if (/^https?:|^mailto:/i.test(href))
            window.open(href, '_blank', 'noopener,noreferrer');
          return true;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerRootListener((root, previous) => {
        previous?.removeEventListener('mousedown', blank);
        root?.addEventListener('mousedown', blank);
      })
    );
    function blank(event: MouseEvent) {
      if (event.target !== editor.getRootElement() || !editor.isEditable()) return;
      editor.update(() => {
        let last = $getRoot().getLastChild();
        if (!(last instanceof NotebookCellNode)) {
          last = new NotebookCellNode().append($createParagraphNode());
          $getRoot().append(last);
        }
        if ($isElementNode(last)) last.selectEnd();
      });
    }
    return () => {
      detach();
      window.removeEventListener('markdown-cell-focus', focusCell);
      window.removeEventListener('hashchange', revealHash);
      cancelAnimationFrame(frame);
    };
  }, [editor, session]);
  return null;
}
