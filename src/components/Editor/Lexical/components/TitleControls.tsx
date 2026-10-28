import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import { $cellAncestor } from '../model/NotebookDocument';
import { NotebookCellNode } from '../model/NotebookCellNode';
import { isNotebookTitleCell } from '../../utils/documentTitle';
import { Image as ImageIcon } from 'lucide-react';
import useStore from '@Store/notebookStore';
import { useEditorReadOnly } from '../../EditorAccessContext';
export function TitleControls() {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        const cell = $isRangeSelection(selection)
          ? $cellAncestor(selection.anchor.getNode())
          : null;
        setActive(cell instanceof NotebookCellNode && cell.isTitle());
      });
      const title = editor.getRootElement()?.querySelector('[data-type=title] h1');
      if (title) {
        title.classList.add('node-title-content');
        title.setAttribute('data-empty', title.textContent ? 'false' : 'true');
        title.setAttribute('data-placeholder', t('common.untitled'));
      }
    };
    update();
    return editor.registerUpdateListener(update);
  }, [editor, t]);
  const first = useStore((state) => state.cells[0]);
  const readOnly = useEditorReadOnly();
  if (
    readOnly ||
    !first ||
    !isNotebookTitleCell(first) ||
    (first.metadata?.icon && first.metadata?.cover)
  )
    return null;
  const cover = first.metadata?.cover;
  const icon = first.metadata?.icon;
  const update = (attributes: { cover?: string; icon?: string }) =>
    useStore.getState().updateCellMetadata(first.id, { ...first.metadata, ...attributes });
  return (
    <div
      contentEditable={false}
      className={`flex gap-2 mb-2 transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'} hover:opacity-100 focus-within:opacity-100 notebook-title-controls`}
    >
      {!icon && (
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          onClick={() =>
            update({
              icon: ['😀', '🚀', '📝', '💡', '✨', '🎨', '📚', '💻'][Math.floor(Math.random() * 8)],
            })
          }
        >
          <span className="text-base">☺</span>Add Icon
        </button>
      )}
      {!cover && (
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          onClick={() =>
            update({
              cover: [
                'https://images.unsplash.com/photo-1506744038136-46273834b3fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
                'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80',
              ][Math.floor(Math.random() * 2)],
            })
          }
        >
          <ImageIcon size={14} />
          Add Cover
        </button>
      )}
    </div>
  );
}
