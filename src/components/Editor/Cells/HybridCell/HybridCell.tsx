import React from 'react';
import { HybridCodeEditor } from './HybridCodeEditor';
import { Trash2, Loader2 } from 'lucide-react';
import { HybridMarkdown } from './HybridMarkdown';
import { Cell as StoreCell } from '@Store/models';
import { useHybridCellViewModel } from './model/useHybridCellViewModel';
import { useEditorReadOnly } from '../../EditorAccessContext';
import useStore from '@Store/notebookStore';

const LoadingIndicator = () => (
  <div role="status" className="flex items-center space-x-2 text-xs text-gray-600">
    <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
    <span>Generating...</span>
  </div>
);

interface HybridCellProps {
  cell: StoreCell;
  onDelete?: (cellId: string) => void;
}

const HybridCell: React.FC<HybridCellProps> = ({ cell, onDelete }) => {
  const readOnly = useEditorReadOnly();
  const isCurrentCell = useStore((state) => state.currentCellId === cell.id);
  const vm = useHybridCellViewModel(cell);
  const contentType = vm.contentType;
  const isGenerating = cell.metadata?.isGenerating === true && !cell.metadata?.generationCompleted;

  return (
    <div className="relative p-4 rounded-lg border shadow-md group">
      {/* Loading animation background */}

      <div className="absolute inset-0 rounded-lg">
        <div
          className={`absolute inset-0 bg-gradient-to-r from-theme-100 via-purple-100 to-pink-100 ${isGenerating ? 'animate-pulse motion-reduce:animate-none' : ''}`}
        ></div>
      </div>

      {/* Content container */}
      <div className="relative">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center space-x-2">{isGenerating && <LoadingIndicator />}</div>
          <div className="flex items-center space-x-2">
            {onDelete && !readOnly && (
              <button
                onClick={() => onDelete(cell.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-red-500 text-white rounded-md hover:bg-red-700"
                title="Delete Cell"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content renderer */}
        <div className="mt-4">
          {contentType.type === 'code' ? (
            <>
              {vm.precedingMarkdown && (
                <div className="prose max-w-none mb-3">
                  <HybridMarkdown source={vm.precedingMarkdown} />
                </div>
              )}
              <div className="border rounded-md overflow-hidden">
                <div className="bg-gray-100 px-4 py-2 text-sm text-gray-700 border-b flex justify-between items-center">
                  <span>{contentType.language}</span>
                  {isCurrentCell && <span className="text-xs text-theme-600">Current Cell</span>}
                </div>
                <HybridCodeEditor
                  cellId={cell.id}
                  content={contentType.content}
                  language={contentType.language}
                  current={isCurrentCell}
                  onChange={vm.handleContentChange}
                />
              </div>
              {vm.followingMarkdown && (
                <div className="prose max-w-none mt-3">
                  <HybridMarkdown source={vm.followingMarkdown} />
                </div>
              )}
            </>
          ) : (
            <div className="prose max-w-none text-base leading-relaxed">
              <HybridMarkdown
                source={contentType.content || (isGenerating ? 'AI is Thinking...' : '')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(HybridCell);
