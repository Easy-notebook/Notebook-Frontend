import React from 'react';
import CodeCell from '@Editor/Cells/CodeCell';
import MarkdownCell from '@Editor/Cells/MarkdownCell';
import ImageCell from '@Editor/Cells/ImageCell';
import LinkCell from '@Editor/Cells/LinkCell';
import useStore from '@Store/notebookStore';

const DetachedCellView: React.FC = () => {
  const { getDetachedCell } = useStore();
  const detachedCell = getDetachedCell();
  if (!detachedCell) return null;
  const props = {
    cell: detachedCell,
    isStepMode: false,
    dslcMode: false,
    isInDetachedView: true,
  } as any;
  switch (detachedCell.type) {
    case 'markdown':
      return <MarkdownCell {...props} />;
    case 'image':
      return <ImageCell {...props} />;
    case 'link':
      return <LinkCell {...props} />;
    default:
      return <CodeCell {...props} />;
  }
};

export default DetachedCellView;
