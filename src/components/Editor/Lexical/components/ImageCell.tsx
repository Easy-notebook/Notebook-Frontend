import { parseImageSource } from '../model/imageSource';
import type { Cell } from '@Store/models';
import { ImageView } from './ImageView';
import { useEditorReadOnly } from '../../EditorAccessContext';
import { useNotebookEditorSession } from '../interaction/NotebookSessionContext';
import useStore from '@Store/notebookStore';
export function ImageCell({ cell }: { cell: Cell }) {
  const readOnly = useEditorReadOnly();
  const session = useNotebookEditorSession();
  const image = parseImageSource(cell.content);
  return (
    <ImageView
      src={image?.src ?? ''}
      alt={image?.alt ?? ''}
      cellId={cell.id}
      markdown={cell.content}
      displayMode={cell.metadata?.displayMode !== false}
      readOnly={readOnly}
      onDelete={() => session.remove(cell.id)}
      onSave={(source) => session.updateSource(cell.id, cell.content, source)}
      onChange={(data) => {
        if (readOnly || !session.owns()) return;
        if (data.displayMode !== undefined)
          useStore
            .getState()
            .updateCellMetadata(cell.id, { ...cell.metadata, displayMode: data.displayMode });
        if (data.markdown !== undefined) session.updateSource(cell.id, cell.content, data.markdown);
      }}
    />
  );
}
