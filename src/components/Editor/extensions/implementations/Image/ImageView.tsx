import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BaseNodeView, BaseNodeViewProps } from '../../core/BaseNodeView';
import { ImageModel, ImageContext } from './ImageModel';
import useStore from '@Store/notebookStore';
import { Upload, X, Edit3, Loader2, Eye, AlignCenter, AlignLeft } from 'lucide-react';
import { Image } from 'antd';
import { generateCellId } from '../../../utils/cellConverters';

const ImageViewComponent = (props: any) => {
  const { node, updateAttributes, deleteNode, fsm } = props;
  const { src, alt, cellId, markdown, displayMode } = node.attrs;
  const { cells, currentCellId, updateCell, viewMode, editingCellId } = useStore();

  const [tempMarkdown, setTempMarkdown] = useState('');
  const [imageError, setImageError] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const textareaRef = useRef<HTMLInputElement>(null);

  const cell = useMemo(() => cells.find((c) => c.id === cellId), [cells, cellId]);
  const isFocused = cellId === currentCellId || cellId === editingCellId;
  const currentState = fsm.getCurrentState();

  const cellContent = cell?.content || '';
  const hasContent = cellContent.trim().length > 0;

  const isGenerating = cell?.metadata?.isGenerating || false;
  const generationType = cell?.metadata?.generationType || 'image';
  const generationPrompt = cell?.metadata?.prompt || '';
  const generationParams = cell?.metadata?.generationParams || {};
  const generationStartTime = cell?.metadata?.generationStartTime;
  const generationError = cell?.metadata?.generationError;
  const generationStatus = cell?.metadata?.generationStatus;

  const shouldShowLoading =
    isGenerating || (cell?.metadata?.generationType && !hasContent && !generationError);

  const isGeneratedContent =
    cell?.metadata?.generationType && hasContent && !isGenerating && !generationError;

  // Infer displayMode and ensure cellId on mount (persistence fix)
  useEffect(() => {
    const updates: any = {};

    // Ensure cellId exists
    if (!cellId) {
      updates.cellId = generateCellId();
    }

    if (typeof props.getPos === 'function') {
      const pos = props.getPos();
      if (typeof pos === 'number' && props.editor) {
        const $pos = props.editor.state.doc.resolve(pos);
        const parentOffset = $pos.parentOffset;

        // If not at start of line (e.g. preceded by space), force inline
        if (parentOffset > 0 && displayMode) {
          updates.displayMode = false;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      updateAttributes(updates);
    }
  }, []); // Run once on mount

  // Sync FSM with cell state
  useEffect(() => {
    if (generationError && currentState !== 'error') {
      fsm.transitionTo('error');
    } else if (shouldShowLoading && currentState !== 'generating') {
      fsm.transitionTo('generating');
    } else if (!shouldShowLoading && !generationError && currentState === 'generating') {
      fsm.transitionTo('idle');
    }
  }, [shouldShowLoading, generationError, currentState, fsm]);

  // Helper to parse markdown
  const parseMarkdown = (markdownStr: string) => {
    const match = markdownStr.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (match) {
      const src = match[2] || '';
      const alt = match[1] || '';
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
      const isVideo = videoExtensions.some((ext) => src.toLowerCase().includes(ext));

      return {
        alt,
        src,
        isValid: true,
        isVideo,
      };
    }
    return { alt: '', src: '', isValid: false, isVideo: false };
  };

  const currentContent = cellContent || markdown || '';
  const previewData = parseMarkdown(currentContent);

  // Timer effect for generation progress
  useEffect(() => {
    let interval: number;

    if (shouldShowLoading) {
      const startTime = generationStartTime || Date.now();
      const updateElapsed = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        setElapsedTime(elapsed);
      };
      updateElapsed();
      interval = setInterval(updateElapsed, 1000);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [shouldShowLoading, generationStartTime]);

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const handleEdit = () => {
    if (viewMode !== 'create' || isGeneratedContent) return;
    setTempMarkdown(currentContent || '![]()');
    fsm.send('EDIT');
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const length = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }, 0);
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
    setImageError(false);
    fsm.send('SAVE');
  };

  const handleCancel = () => {
    setTempMarkdown(currentContent || '');
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

  const handleImageError = () => {
    setImageError(true);
  };

  const handleImageLoad = () => {
    setImageError(false);
  };

  const clearGenerationError = () => {
    if (cell?.metadata) {
      cell.metadata.generationError = undefined;
      cell.metadata.isGenerating = false;
    }
    if (updateCell) {
      updateCell(cellId, cellContent);
    }
    fsm.send('RETRY');
  };

  // Temp preview for editing mode
  const tempPreviewData = parseMarkdown(tempMarkdown);

  // Wrapper styles based on displayMode
  const wrapperStyle: React.CSSProperties = displayMode
    ? {
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        margin: '0.5em 0',
      }
    : {
        display: 'inline-block',
        verticalAlign: 'middle',
        margin: '0 0.2em',
      };

  if (currentState === 'generating' || shouldShowLoading) {
    return (
      <div
        className="relative p-4 rounded-lg border shadow-md group"
        style={
          displayMode
            ? { width: '100%', maxWidth: '600px', margin: '0 auto' }
            : { display: 'inline-block', minWidth: '300px' }
        }
      >
        <div className="absolute inset-0 rounded-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-theme-100 via-purple-100 to-pink-100 animate-pulse"></div>
        </div>

        <div className="relative">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 text-xs text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating {generationType === 'video' ? 'Video' : 'Image'}...</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <span>Elapsed: {formatElapsedTime(elapsedTime)}</span>
            </div>
          </div>

          <div className="mt-4">
            {generationStatus && (
              <div className="mb-3 text-xs text-theme-600 bg-theme-100 px-2 py-1 rounded inline-block">
                Status: {generationStatus}
              </div>
            )}

            {generationPrompt && (
              <div className="mb-3 p-3 bg-white/70 backdrop-blur-sm rounded border border-gray-200">
                <div className="text-xs text-gray-500 font-medium mb-1">Prompt:</div>
                <div className="text-sm text-gray-700">&quot;{generationPrompt}&quot;</div>
              </div>
            )}

            {Object.keys(generationParams).length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {generationParams.quality && (
                  <span className="px-2 py-1 bg-theme-100 text-theme-700 text-xs rounded font-medium">
                    Quality: {generationParams.quality}
                  </span>
                )}
                {generationParams.ratio && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded font-medium">
                    Ratio: {generationParams.ratio}
                  </span>
                )}
                {generationParams.duration && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">
                    Duration: {generationParams.duration}s
                  </span>
                )}
              </div>
            )}

            <div className="text-xs text-gray-400 text-center">
              Generation typically takes 1-5 minutes. Please wait...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentState === 'error' || generationError) {
    return (
      <div
        className="relative p-4 rounded-lg border shadow-md group"
        style={
          displayMode
            ? { width: '100%', maxWidth: '600px', margin: '0 auto' }
            : { display: 'inline-block', minWidth: '300px' }
        }
      >
        <div className="relative">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center space-x-2 text-xs text-red-600">
              <X className="w-4 h-4" />
              <span>Generation Failed</span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <span>Elapsed: {formatElapsedTime(elapsedTime)}</span>
            </div>
          </div>

          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
            <div className="text-red-800 font-medium mb-2">
              {generationType === 'video' ? 'Video' : 'Image'} Generation Failed
            </div>
            <div className="text-red-600 mb-3">{generationError}</div>
            <button
              onClick={clearGenerationError}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs"
            >
              Clear Error
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentState === 'editing') {
    return (
      <div
        className="image-editor"
        style={
          displayMode
            ? { width: '100%', maxWidth: '600px', margin: '0 auto' }
            : { display: 'inline-block', minWidth: '300px' }
        }
      >
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

        {/* Live media preview */}
        {tempPreviewData.isValid && tempPreviewData.src ? (
          <div className="mt-3">
            {tempPreviewData.isVideo ? (
              <video
                src={tempPreviewData.src}
                controls
                className="max-w-full h-auto rounded-lg shadow-sm"
                onError={handleImageError}
                onLoadedData={handleImageLoad}
              >
                Your browser does not support video playback
              </video>
            ) : (
              <Image
                src={tempPreviewData.src}
                alt={tempPreviewData.alt}
                onError={handleImageError}
                onLoad={handleImageLoad}
                className="max-w-full h-auto rounded-lg shadow-sm"
                preview={false}
              />
            )}

            {imageError && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
                Failed to load {tempPreviewData.isVideo ? 'video' : 'image'}: {tempPreviewData.src}
              </div>
            )}

            {tempPreviewData.alt && !imageError && (
              <div className="mt-2 text-sm text-gray-600 text-center italic">
                {tempPreviewData.alt}
              </div>
            )}
          </div>
        ) : tempMarkdown ? (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
            Please check Markdown syntax: ![description](URL)
          </div>
        ) : (
          <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-gray-500 text-sm">
            Enter Markdown syntax to see preview
          </div>
        )}
      </div>
    );
  }

  // Idle / Display state
  return (
    <div className="image-display relative group" style={wrapperStyle}>
      {previewData.isValid && previewData.src ? (
        <div className="relative" style={{ maxWidth: displayMode ? '100%' : 'none' }}>
          {previewData.isVideo ? (
            <video
              src={previewData.src}
              controls
              title={previewData.alt}
              onError={handleImageError}
              onLoadedData={handleImageLoad}
              className="max-w-full h-auto rounded-lg shadow-sm"
              style={{ maxHeight: displayMode ? '600px' : '2.5em', verticalAlign: 'middle' }}
            >
              Your browser does not support video playback
            </video>
          ) : (
            <>
              <Image
                src={previewData.src}
                alt={previewData.alt}
                title={previewData.alt}
                onError={handleImageError}
                onLoad={handleImageLoad}
                className="max-w-full h-auto rounded-lg shadow-sm"
                style={{ maxHeight: displayMode ? 'none' : '2.5em', verticalAlign: 'middle' }}
                preview={viewMode === 'create' ? false : true}
              />
              {/* Hidden image for programmatic preview */}
              <div style={{ display: 'none' }}>
                <Image
                  src={previewData.src}
                  preview={{
                    visible: isPreviewVisible,
                    onVisibleChange: setIsPreviewVisible,
                    src: previewData.src,
                  }}
                />
              </div>
            </>
          )}

          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center text-gray-500">
                <X className="h-8 w-8 mx-auto mb-2" />
                <div className="text-sm">
                  Failed to load {previewData.isVideo ? 'video' : 'image'}
                </div>
                <div className="text-xs">{previewData.src}</div>
              </div>
            </div>
          )}

          {/* Floating toolbar - show on hover in create mode */}
          {viewMode === 'create' && (
            <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {/* Preview button */}
              {!previewData.isVideo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPreviewVisible(true);
                  }}
                  className="p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
                  title="Preview"
                >
                  <Eye size={14} />
                </button>
              )}

              {/* Toggle Display Mode */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const newMode = !displayMode;
                  let newMarkdown = markdown || cellContent || `![${alt || ''}](${src || ''})`;

                  // Adjust markdown for persistence
                  // If switching to Inline, prepend space if not present
                  if (!newMode) {
                    if (!newMarkdown.startsWith(' ')) {
                      newMarkdown = ' ' + newMarkdown;
                    }
                  } else {
                    // If switching to Block, remove leading spaces
                    newMarkdown = newMarkdown.trimStart();
                  }

                  updateAttributes({
                    displayMode: newMode,
                    markdown: newMarkdown,
                  });

                  // Persist to store if possible
                  if (cellId && updateCell) {
                    updateCell(cellId, newMarkdown);
                  }
                }}
                className="p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
                title={displayMode ? 'Switch to Inline' : 'Switch to Block'}
              >
                {displayMode ? <AlignLeft size={14} /> : <AlignCenter size={14} />}
              </button>

              {/* Edit button - only show for non-generated content */}
              {!isGeneratedContent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit();
                  }}
                  className="p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
                  title="Edit"
                >
                  <Edit3 size={14} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNode();
                }}
                className="p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
                title="Delete"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Media caption - only for block mode */}
          {displayMode && previewData.alt && !imageError && (
            <div className="mt-2 text-sm text-gray-600 text-center italic">{previewData.alt}</div>
          )}
        </div>
      ) : (
        // Empty state or invalid syntax
        <div
          className={`image-placeholder border-2 border-dashed border-gray-300 rounded-lg p-8 text-center ${
            viewMode === 'create' && isFocused
              ? 'hover:border-gray-400 transition-colors cursor-pointer'
              : ''
          }`}
          onClick={viewMode === 'create' && isFocused ? handleEdit : undefined}
          style={displayMode ? {} : { padding: '0.2em', display: 'inline-block' }}
        >
          {displayMode ? (
            <>
              <Upload className="h-12 w-12 text-gray-400 mb-4 mx-auto" />
              <div className="text-gray-600 mb-2">
                {hasContent
                  ? 'Markdown syntax error'
                  : viewMode === 'create' && isFocused
                    ? 'Click to add media'
                    : 'Media content'}
              </div>
              <div className="text-sm text-gray-400">Format: ![description](image/video URL)</div>
            </>
          ) : (
            <Upload className="h-4 w-4 text-gray-400" />
          )}

          {hasContent &&
            viewMode === 'create' &&
            isFocused &&
            !isGeneratedContent &&
            displayMode && (
              <div className="mt-2 font-mono text-xs text-gray-500 bg-gray-50 p-2 rounded">
                {cellContent}
              </div>
            )}
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
      wrapperComponent={props.node.attrs.displayMode ? 'div' : 'span'}
    />
  );
};
