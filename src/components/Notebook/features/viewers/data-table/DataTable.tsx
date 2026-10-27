import { useState, type FC } from 'react';
import usePreviewStore from '@Store/previewStore';
import useStore from '@Store/notebookStore';
import SpreadsheetEditor, {
  type SpreadsheetPreviewProps,
  type SpreadsheetEditorProps,
} from './SpreadsheetEditor';

import { SpreadsheetEditSession } from './SpreadsheetEditSession';

export type { CSVRow } from './SpreadsheetEditor';

/** Replaces every transient editor state only when the source is externally replaced. */
const SpreadsheetSourceBoundary: FC<
  Omit<SpreadsheetEditorProps, 'editSession'> & { sourceKey: string }
> = ({ sourceKey, ...props }) => {
  const content = props.currentFile?.content ?? '';
  const [owner, setOwner] = useState(() => ({
    content,
    generation: 0,
    session: new SpreadsheetEditSession(),
  }));
  if (owner.content !== content) {
    const retain = owner.session.retainsDraft(sourceKey, content);
    setOwner({
      content,
      generation: owner.generation + (retain ? 0 : 1),
      session: retain ? owner.session : new SpreadsheetEditSession(),
    });
    return null;
  }
  return <SpreadsheetEditor key={owner.generation} {...props} editSession={owner.session} />;
};

const DataTable: FC<SpreadsheetPreviewProps> = (props) => {
  const activeFile = usePreviewStore((state) => state.activeFile);
  const activeSplitFile = usePreviewStore((state) => state.activeSplitFile);
  const detachedCellId = useStore((state) => state.detachedCellId);
  const isInSplitView = !!detachedCellId;
  const currentFile = isInSplitView ? activeSplitFile : activeFile;
  const identity = JSON.stringify([
    isInSplitView,
    currentFile?.id,
    props.typeOverride || currentFile?.type,
  ]);
  return (
    <SpreadsheetSourceBoundary
      key={identity}
      sourceKey={identity}
      {...props}
      currentFile={currentFile}
      isInSplitView={isInSplitView}
    />
  );
};

export default DataTable;
