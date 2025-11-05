import { Node, mergeAttributes, RawCommands } from '@tiptap/core';
import { InputRule } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Edit3, Loader2 } from 'lucide-react';
import { Image } from 'antd';
import useStore from '@Store/notebookStore';

const ImageComponent = ({ node, updateAttributes, deleteNode }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempMarkdown, setTempMarkdown] = useState('');
  const [imageError, setImageError] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const textareaRef = useRef<HTMLInputElement>(null);

  const { cells, currentCellId, updateCell, viewMode, editingCellId } = useStore();

  const cellId = node.attrs.cellId || currentCellId;

  const isFocused = cellId === currentCellId || cellId === editingCellId;

  const cell = React.useMemo(() => {
    const foundCell = cells.find((c) => c.id === cellId) || null;
    return foundCell;
  }, [cells, cellId]);

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

  const parseMarkdown = (markdownStr: string) => {
    const match = markdownStr.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (match) {
      const src = match[2] || '';
      const alt = match[1] || '';

      const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
      const isVideo = videoExtensions.some((ext) => src.toLowerCase().includes(ext));

      console.log('🎬 Video detection:', { src, isVideo, extensions: videoExtensions });

      return {
        alt,
        src,
        isValid: true,
        isVideo,
      };
    }
    return {
      alt: '',
      src: '',
      isValid: false,
      isVideo: false,
    };
  };

  const currentContent = cellContent || '';
  const previewData = parseMarkdown(currentContent);

  useEffect(() => {
    if (!isFocused && isEditing) {
      saveEdit();
    }
  }, [isFocused, isEditing]);

  // 当store中的内容变化时，同步到node属性和临时编辑状态
  useEffect(() => {
    // 仅当 store 中存在有效的内容且与当前 attrs 不一致时才写回，避免在撤销后覆盖历史内容
    if (cellContent) {
      const parsed = parseMarkdown(cellContent);
      if (parsed.isValid) {
        const nextAttrs = {
          markdown: cellContent,
          src: parsed.src,
          alt: parsed.alt,
          title: parsed.alt,
          cellId: cellId,
        };
        const changed =
          node.attrs?.markdown !== nextAttrs.markdown ||
          node.attrs?.src !== nextAttrs.src ||
          node.attrs?.alt !== nextAttrs.alt ||
          node.attrs?.title !== nextAttrs.title ||
          node.attrs?.cellId !== nextAttrs.cellId;
        if (changed) {
          updateAttributes(nextAttrs);
        }
      }
      // 同步临时编辑内容
      if (!isEditing && tempMarkdown !== cellContent) {
        setTempMarkdown(cellContent);
      }
    }
  }, [
    cellContent,
    cellId,
    isEditing,
    node.attrs?.markdown,
    node.attrs?.src,
    node.attrs?.alt,
    node.attrs?.title,
    tempMarkdown,
  ]);

  // 初始化
  useEffect(() => {
    // 初始化时，如果节点已有内容，则仅同步到本地临时状态；避免用占位符覆盖撤销恢复的图片
    if (currentContent) {
      if (tempMarkdown !== currentContent) setTempMarkdown(currentContent);
    }
    // 不再默认进入编辑模式，除非显式触发
  }, [cellId, currentContent, tempMarkdown]);

  // 开始编辑 - 只在创建模式下允许，且不是生成完成的内容，且必须处于聚焦状态
  const startEditing = () => {
    if (viewMode !== 'create' || isGeneratedContent || !isFocused) return;

    setIsEditing(true);
    setTempMarkdown(currentContent || '![]()');
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const length = tempMarkdown.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }, 0);
  };

  // 保存编辑 - 直接更新store
  function saveEdit() {
    if (cellId && updateCell) {
      // 直接更新store中的cell content
      updateCell(cellId, tempMarkdown);
    }

    // 同步更新tiptap node属性
    const parsed = parseMarkdown(tempMarkdown);
    updateAttributes({
      markdown: tempMarkdown,
      src: parsed.src,
      alt: parsed.alt,
      title: parsed.alt,
      cellId: cellId,
    });

    setIsEditing(false);
    setImageError(false);
  }

  // 取消编辑
  const cancelEdit = () => {
    setTempMarkdown(currentContent || '');
    setIsEditing(false);
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // 实时解析临时编辑内容
  const tempPreviewData = parseMarkdown(tempMarkdown);

  // 处理图片加载错误
  const handleImageError = () => {
    setImageError(true);
  };

  const handleImageLoad = () => {
    setImageError(false);
  };

  // Timer effect for generation progress
  useEffect(() => {
    let interval: number;

    if (shouldShowLoading && generationStartTime) {
      // 立即设置一次，然后每秒更新
      const updateElapsed = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - generationStartTime) / 1000);
        setElapsedTime(elapsed);
      };
      updateElapsed(); // 立即执行一次
      interval = setInterval(updateElapsed, 1000);
    } else if (shouldShowLoading && !generationStartTime) {
      // 如果在loading状态但没有开始时间，使用当前时间作为起点
      const startTime = Date.now();
      const updateElapsed = () => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTime) / 1000);
        setElapsedTime(elapsed);
      };
      updateElapsed(); // 立即执行一次
      interval = setInterval(updateElapsed, 1000);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [shouldShowLoading, generationStartTime, isGenerating]);

  // Format elapsed time
  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <>
      <NodeViewWrapper
        className="image-markdown-wrapper color-black"
        key={`${cellId}-${currentContent?.length || 0}`}
        data-cell-id={cellId}
      >
        {shouldShowLoading ? (
          // Generation state - highest priority, overrides all other states
          <div className="relative p-4 rounded-lg border shadow-md group">
            {/* Loading animation background */}
            <div className="absolute inset-0 rounded-lg">
              <div className="absolute inset-0 bg-gradient-to-r from-theme-100 via-purple-100 to-pink-100 animate-pulse"></div>
            </div>

            {/* Content container */}
            <div className="relative">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-2">
                  {generationError ? (
                    <div className="flex items-center space-x-2 text-xs text-red-600">
                      <X className="w-4 h-4" />
                      <span>Generation Failed</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-xs text-gray-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating {generationType === 'video' ? 'Video' : 'Image'}...</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <span>Elapsed: {formatElapsedTime(elapsedTime)}</span>
                </div>
              </div>

              {generationError ? (
                // Error state
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
                  <div className="text-red-800 font-medium mb-2">
                    {generationType === 'video' ? 'Video' : 'Image'} Generation Failed
                  </div>
                  <div className="text-red-600 mb-3">{generationError}</div>
                  <button
                    onClick={() => {
                      // Clear error and allow retry
                      if (cell?.metadata) {
                        cell.metadata.generationError = undefined;
                        cell.metadata.isGenerating = false;
                      }
                      updateCell(cellId, cellContent);
                    }}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs"
                  >
                    Clear Error
                  </button>
                </div>
              ) : (
                // Normal generation content
                <div className="mt-4">
                  {/* Generation status */}
                  {generationStatus && (
                    <div className="mb-3 text-xs text-theme-600 bg-theme-100 px-2 py-1 rounded inline-block">
                      Status: {generationStatus}
                    </div>
                  )}

                  {/* Prompt display */}
                  {generationPrompt && (
                    <div className="mb-3 p-3 bg-white/70 backdrop-blur-sm rounded border border-gray-200">
                      <div className="text-xs text-gray-500 font-medium mb-1">Prompt:</div>
                      <div className="text-sm text-gray-700">&quot;{generationPrompt}&quot;</div>
                    </div>
                  )}

                  {/* Parameters display */}
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

                  {/* Progress hint */}
                  <div className="text-xs text-gray-400 text-center">
                    Generation typically takes 1-5 minutes. Please wait...
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isEditing ? (
          // Edit mode: direct markdown editing with live preview
          <div className="image-editor">
            {/* Markdown source editor */}
            <input
              ref={textareaRef}
              type="text"
              value={tempMarkdown}
              onChange={(e) => setTempMarkdown(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveEdit}
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
                    Failed to load {tempPreviewData.isVideo ? 'video' : 'image'}:{' '}
                    {tempPreviewData.src}
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
        ) : (
          // Display mode: show media with toolbar
          <div className="image-display relative group">
            {previewData.isValid && previewData.src ? (
              <div className="relative">
                {previewData.isVideo ? (
                  <video
                    src={previewData.src}
                    controls
                    title={previewData.alt}
                    onError={handleImageError}
                    onLoadedData={handleImageLoad}
                    className="max-w-full h-auto rounded-lg shadow-sm"
                  >
                    Your browser does not support video playback
                  </video>
                ) : (
                  <Image
                    src={previewData.src}
                    alt={previewData.alt}
                    title={previewData.alt}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    className="max-w-full h-auto rounded-lg shadow-sm"
                    preview={
                      viewMode === 'create'
                        ? {
                            mask: (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-50 rounded p-1 flex items-center justify-center text-white text-sm">
                                Click to View
                              </div>
                            ),
                          }
                        : false
                    }
                  />
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

                {/* Floating toolbar - only show in create mode and when focused */}
                {viewMode === 'create' && isFocused && (
                  <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Edit button - only show for non-generated content */}
                    {!isGeneratedContent && (
                      <button
                        onClick={startEditing}
                        className="p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
                        title="Edit"
                      >
                        <Edit3 size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNode()}
                      className="p-1 bg-black bg-opacity-50 text-white rounded hover:bg-opacity-70"
                      title="Delete"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Media caption */}
                {previewData.alt && !imageError && (
                  <div className="mt-2 text-sm text-gray-600 text-center italic">
                    {previewData.alt}
                  </div>
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
                onClick={viewMode === 'create' && isFocused ? startEditing : undefined}
              >
                <Upload className="h-12 w-12 text-gray-400 mb-4 mx-auto" />
                <div className="text-gray-600 mb-2">
                  {hasContent
                    ? 'Markdown syntax error'
                    : viewMode === 'create' && isFocused
                      ? 'Click to add media'
                      : 'Media content'}
                </div>
                <div className="text-sm text-gray-400">Format: ![description](image/video URL)</div>
                {hasContent && viewMode === 'create' && isFocused && !isGeneratedContent && (
                  <div className="mt-2 font-mono text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    {cellContent}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </NodeViewWrapper>
    </>
  );
};

// 定义Image节点
export const ImageExtension = Node.create({
  name: 'markdownImage',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      markdown: {
        default: null,
      },
      cellId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => ({
          src: element.getAttribute('src'),
          alt: element.getAttribute('alt'),
          title: element.getAttribute('title'),
          markdown: `![${element.getAttribute('alt') || ''}](${element.getAttribute('src') || ''})`,
        }),
      },
      {
        tag: 'div[data-type="markdown-image"]',
        getAttrs: (element) => {
          const dataSrc = element.getAttribute('data-src') || '';
          const dataAlt = element.getAttribute('data-alt') || '';
          const dataMarkdown = element.getAttribute('data-markdown') || '';
          const dataCellId = element.getAttribute('data-cell-id') || '';

          return {
            src: dataSrc,
            alt: dataAlt,
            title: dataAlt,
            markdown: dataMarkdown,
            cellId: dataCellId,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        { 'data-type': 'markdown-image' },
        {
          'data-src': HTMLAttributes.src,
          'data-alt': HTMLAttributes.alt,
          'data-title': HTMLAttributes.title,
          'data-markdown': HTMLAttributes.markdown,
          'data-cell-id': HTMLAttributes.cellId,
        }
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageComponent);
  },

  addCommands() {
    return {
      setImage:
        (options: Record<string, any>) =>
        ({ commands }: { commands: any }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    } as Partial<RawCommands>;
  },

  addInputRules() {
    return [
      new InputRule({
        find: /!\[([^\]]*)\]\(([^)]+)\)$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const start = range.from;
          const end = range.to;

          const alt = match[1] || '';
          const src = match[2] || '';
          const markdown = match[0];

          tr.replaceWith(
            start,
            end,
            this.type.create({
              src,
              alt,
              title: alt,
              markdown,
            })
          );
        },
      }),
    ];
  },
});

export default ImageExtension;
