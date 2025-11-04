import React from 'react';
import CodeCell from '../../Editor/Cells/CodeCell';
import MarkdownCell from '../../Editor/Cells/MarkdownCell';
import ImageCell from '../../Editor/Cells/ImageCell';
import LinkCell from '../../Editor/Cells/LinkCell';
import useStore from '../../../store/notebookStore';

const DetachedCellView: React.FC = () => {
    const { getDetachedCell} = useStore();
    const detachedCell = getDetachedCell();

    if (!detachedCell) {
        return null;
    }

    const renderDetachedCell = () => {
        const props = {
            cell: detachedCell,
            isStepMode: false,
            dslcMode: false,
            isInDetachedView: true
        };

        switch (detachedCell.type) {
            case 'markdown':
                return <MarkdownCell {...(props as any)} />;
            case 'image':
                return <ImageCell {...(props as any)} />;
            case 'link':
                return <LinkCell {...(props as any)} />;
            default:
                return <CodeCell {...(props as any)} />;
        }
    };

    return (
        <div className="w-full h-full bg-gray-50">
            {renderDetachedCell()}
        </div>
    );
};

export default DetachedCellView;