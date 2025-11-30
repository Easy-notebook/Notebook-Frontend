import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BaseNodeView, BaseNodeViewProps } from '../../core/BaseNodeView';
import { ImageModel, ImageContext } from './ImageModel';
import useStore from '@Store/notebookStore';
import { Upload, X, Edit3, Loader2 } from 'lucide-react';
import { Image } from 'antd';

const ImageViewComponent = (props: any) => {
  const { node, updateAttributes, deleteNode, fsm } = props;
  const { src, alt, cellId, markdown } = node.attrs;
  const { cells, currentCellId, updateCell, viewMode, editingCellId } = useStore();

  const [tempMarkdown, setTempMarkdown] = useState('');
  const textareaRef = useRef<HTMLInputElement>(null);

  const cell = useMemo(() => cells.find((c) => c.id === cellId), [cells, cellId]);
  const isFocused = cellId === currentCellId || cellId === editingCellId;
  const currentState = fsm.getCurrentState();

  // Sync FSM with cell state (e.g. generation)
  useEffect(() => {
    if (cell?.metadata?.isGenerating && currentState !== 'generating') {
      fsm.transitionTo('generating');
    } else if (!cell?.metadata?.isGenerating && currentState === 'generating') {
      fsm.transitionTo('idle');
    }
  }, [cell?.metadata?.isGenerating, currentState, fsm]);

  // Helper to parse markdown
  const parseMarkdown = (markdownStr: string) => {
    const match = markdownStr.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (match) {
      return {
        alt: match[1] || '',
        src: match[2] || '',
        isValid: true,
        isVideo: ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'].some((ext) =>
          (match[2] || '').toLowerCase().includes(ext)
        ),
      };
    }
    return { alt: '', src: '', isValid: false, isVideo: false };
  };

  const previewData = parseMarkdown(cell?.content || markdown || '');

  const handleEdit = () => {
    setTempMarkdown(cell?.content || markdown || '');
    fsm.send('EDIT');
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSave = () => {
    if (cellId && updateCell) {
      updateCell(cellId, tempMarkdown);
    }
    const parsed = parseMarkdown(tempMarkdown);
    updateAttributes({
      markdown: tempMarkdown,
      src: parsed.src,
      alt: parsed.alt,
      title: parsed.alt,
      cellId,
    });
    fsm.send('SAVE');
  };

  const handleCancel = () => {
    fsm.send('CANCEL');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (currentState === 'generating') {
    return (
      <div className="relative p-4 rounded-lg border shadow-md group">
        <div className="absolute inset-0 rounded-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-theme-100 via-purple-100 to-pink-100 animate-pulse"></div>
        </div>
        <div className="relative flex items-center space-x-2 text-xs text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Generating...</span>
        </div>
      </div>
    );
  }

  if (currentState === 'editing') {
    return (
      <div className="image-editor">
        <input
          ref={textareaRef}
          type="text"
          value={tempMarkdown}
          onChange={(e) => setTempMarkdown(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder="![Image description](Image URL)"
          className="w-full p-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-theme-400 text-black"
        />
      </div>
    );
  }

  // Idle / Display state
  return (
    <div className="image-display relative group">
      {previewData.isValid && previewData.src ? (
        <div className="relative">
          {previewData.isVideo ? (
            <video
              src={previewData.src}
              controls
              title={previewData.alt}
              className="max-w-full h-auto rounded-lg shadow-sm"
            >
              Your browser does not support video playback
            </video>
          ) : (
            <Image
              src={previewData.src}
              alt={previewData.alt}
              title={previewData.alt}
              className="max-w-full h-auto rounded-lg shadow-sm"
              preview={
                viewMode === 'create'
                  ? { mask: <div className="text-white text-sm">Click to View</div> }
                  : false
              }
            />
          )}
          {viewMode === 'create' && isFocused && (
            <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleEdit}
                className="p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
              >
                <Edit3 size={14} />
              </button>
              <button
                onClick={() => deleteNode()}
                className="p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`image-placeholder border-2 border-dashed border-gray-300 rounded-lg p-8 text-center ${
            viewMode === 'create' && isFocused
              ? 'hover:border-gray-400 transition-colors cursor-pointer'
              : ''
          }`}
          onClick={viewMode === 'create' && isFocused ? handleEdit : undefined}
        >
          <Upload className="h-12 w-12 text-gray-400 mb-4 mx-auto" />
          <div className="text-gray-600 mb-2">
            {viewMode === 'create' && isFocused ? 'Click to add media' : 'Media content'}
          </div>
        </div>
      )}
    </div>
  );
};

export const ImageView = (props: any) => {
  const { cells } = useStore();
  // We need to pass cell context to FSM creation
  const cell = cells.find((c) => c.id === props.node.attrs.cellId);

  return (
    <BaseNodeView<ImageContext>
      {...props}
      createFSM={ImageModel.createFSM}
      createContext={(p) => ({
        node: p.node,
        updateAttributes: p.updateAttributes,
        deleteNode: p.deleteNode,
        cell: cell,
      })}
      renderState={(state, context, fsm) => <ImageViewComponent {...props} fsm={fsm} />}
    />
  );
};
