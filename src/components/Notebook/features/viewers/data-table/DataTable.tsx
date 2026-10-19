import type { FC } from 'react';
import usePreviewStore from '@Store/previewStore';
import useStore from '@Store/notebookStore';
import SpreadsheetEditor, { type SpreadsheetPreviewProps } from './SpreadsheetEditor';

export type { CSVRow } from './SpreadsheetEditor';

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
    <SpreadsheetEditor
      key={identity}
      {...props}
      currentFile={currentFile}
      isInSplitView={isInSplitView}
    />
  );
};

export default DataTable;
