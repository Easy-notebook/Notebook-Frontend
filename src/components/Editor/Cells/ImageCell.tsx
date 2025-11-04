import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Eye, Edit3, X, Loader2 } from 'lucide-react';
import { Image, ImageProps } from 'antd';
import useStore from '../../../store/notebookStore';

interface Cell {
  id: string;
  content: string;
  type: string;
  outputs: any[];
  enableEdit: boolean;
  metadata?: {
    isGenerating?: boolean;
    generationStartTime?: number;
    prompt?: string;
    generationType?: 'video' | 'image';
    generationParams?: {
      quality?: string;
      ratio?: string;
      duration?: string;
    };
    generationError?: string;
    generationStatus?: string;
    [key: string]: any;
  };
}

interface ImageCellProps {
  cell: Cell;
}

const ImageCell: React.FC<ImageCellProps> = ({ cell: propCell }) => {
  const {
    updateCell,
    updateCellMetadata,
    deleteCell,
    editingCellId,
    setEditingCellId,
    showButtons,
    setShowButtons,
    viewMode,
    cells,
  } = useStore();

  // 使用 useMemo 从 store 获取最新的 cell 数据，确保能实时响应 metadata 的更新
  const cell = React.useMemo(() => {
    return cells.find(c => c.id === propCell.id) || propCell;
  }, [cells, propCell.id, propCell]);

  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editingCellId === cell.id;
  const hasContent = cell.content.trim().length > 0;
  const cellShowButtons = showButtons[cell.id] || false;

  const [imageError, setImageError] = useState(false);
  const [tempContent, setTempContent] = useState(cell.content);
  const [elapsedTime, setElapsedTime] = useState(0);

  // 从 cell 的 metadata 中解析生成状态
  const {
    isGenerating = false,
    generationType = 'image',
    // 后端与store使用的键为 prompt，这里映射到 generationPrompt 供UI展示
    prompt: generationPrompt = '',
    generationParams = {},
    generationStartTime,
    generationError,
    generationStatus,
  } = cell.metadata || {};

  const shouldShowLoading = isGenerating || (cell.metadata?.generationType && !hasContent && !generationError);

  // 解析 Markdown 语法并检测媒体类型
  const parseMarkdown = (markdownStr: string) => {
    const match = markdownStr.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (match) {
      const src = match[2] || '';
      const alt = match[1] || '';
      const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
      const isVideo = videoExtensions.some(ext => src.toLowerCase().includes(ext));
      return { alt, src, isValid: true, isVideo };
    }
    return { alt: '', src: '', isValid: false, isVideo: false };
  };

  const imageData = parseMarkdown(cell.content);
  const previewData = parseMarkdown(tempContent);

  // -- Handlers --

  const startEditing = useCallback(() => {
    if (viewMode !== "create") return;
    setEditingCellId(cell.id);
    setTempContent(cell.content);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const length = cell.content.length;
        inputRef.current.setSelectionRange(length, length);
      }
    }, 0);
  }, [cell.id, cell.content, setEditingCellId, viewMode]);

  const saveEdit = useCallback(() => {
    updateCell(cell.id, tempContent);
    setEditingCellId(null);
  }, [cell.id, tempContent, updateCell, setEditingCellId]);

  const cancelEdit = useCallback(() => {
    setTempContent(cell.content);
    setEditingCellId(null);
  }, [cell.content, setEditingCellId]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }, [saveEdit, cancelEdit]);

  const handleClearError = () => {
    const newMetadata = {
      ...cell.metadata,
      isGenerating: false,
      generationError: undefined,
      generationStatus: undefined,
    };
    updateCellMetadata(cell.id, newMetadata);
  };


  // -- Effects --

  // 编辑状态自动聚焦
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    } else if (!isEditing) {
      // 如果从编辑状态退出，确保临时内容与cell内容同步
      setTempContent(cell.content);
    }
  }, [isEditing, cell.content]);
  
  // 处理失焦自动保存
  const handleBlur = useCallback(() => {
    if (isEditing) {
      saveEdit();
    }
  }, [isEditing, saveEdit]);

  // 生成状态计时器
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (shouldShowLoading && !generationError) {
      const startTime = generationStartTime || Date.now();
      const update = () => setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      update();
      interval = setInterval(update, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [shouldShowLoading, generationStartTime, generationError]);

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // 渲染函数
  const renderGenerationState = () => (
    <div className="relative p-4 rounded-lg border shadow-md group">
      {/* 动态背景 */}
      {!generationError && (
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-theme-100 via-purple-100 to-pink-100 animate-pulse"></div>
          <div className="absolute inset-0 bg-white/60"></div>
        </div>
      )}

      {/* 内容容器 */}
      <div className="relative">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center space-x-2 text-xs">
            {generationError ? (
              <div className="flex items-center space-x-2 text-red-600 font-semibold">
                <X className="w-4 h-4" />
                <span>生成失败</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin text-theme-500" />
                <span>正在生成 {generationType === 'video' ? '视频' : '图片'}...</span>
              </div>
            )}
          </div>
          {!generationError && (
            <div className="text-xs text-gray-500">
              已用时: {formatElapsedTime(elapsedTime)}
            </div>
          )}
        </div>

        {generationError ? (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
            <div className="text-red-700 mb-3">{generationError}</div>
            <button
              onClick={handleClearError}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs font-semibold"
            >
              清除错误
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {generationStatus && (
              <div className="text-xs text-theme-600 bg-theme-100 px-2 py-1 rounded inline-block">
                状态: {generationStatus}
              </div>
            )}
            {generationPrompt && (
              <div className="p-3 bg-white/70 backdrop-blur-sm rounded border border-gray-200">
                <div className="text-xs text-gray-500 font-medium mb-1">提示词:</div>
                <div className="text-sm text-gray-700">"{generationPrompt}"</div>
              </div>
            )}
            {Object.keys(generationParams).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {generationParams.quality && <span className="px-2 py-1 bg-theme-100 text-theme-700 text-xs rounded font-medium">质量: {generationParams.quality}</span>}
                {generationParams.ratio && <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded font-medium">比例: {generationParams.ratio}</span>}
                {generationParams.duration && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">时长: {generationParams.duration}s</span>}
              </div>
            )}
            <div className="text-xs text-gray-400 text-center pt-2">
              生成通常需要1-5分钟，请耐心等待...
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderEditState = () => (
    <div className="image-editor text-black">
      <input
        ref={inputRef}
        type="text"
        value={tempContent}
        onChange={(e) => setTempContent(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="![图片描述](图片URL)"
        className="w-full p-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-theme-400"
      />
      {previewData.isValid && previewData.src ? (
        <div className="mt-3">
          {previewData.isVideo ? (
            <video src={previewData.src} controls className="max-w-full h-auto rounded-lg shadow-sm" onError={() => setImageError(true)} onLoadedData={() => setImageError(false)}>您的浏览器不支持视频播放</video>
          ) : (
            <Image
              src={previewData.src}
              alt={previewData.alt}
              className="max-w-full h-auto rounded-lg shadow-sm"
              preview={false}
              onError={() => setImageError(true)}
              onLoad={() => setImageError(false)}
            />
          )}
          {imageError && <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">⚠️ 加载失败: {previewData.src}</div>}
          {previewData.alt && !imageError && <div className="mt-2 text-sm text-center italic">{previewData.alt}</div>}
        </div>
      ) : tempContent ? (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">⚠️ 请检查 Markdown 语法: ![描述](URL)</div>
      ) : (
        <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm">输入 Markdown 语法以预览</div>
      )}
    </div>
  );

  const renderDisplayState = () => (
    <div className="image-display">
      {imageData.isValid && imageData.src ? (
        <div className="relative">
          {(imageData.isVideo || (cell.metadata?.generationType === 'video')) ? (
            <video src={imageData.src} controls title={imageData.alt} className="max-w-full h-auto rounded-lg shadow-sm" onError={() => setImageError(true)} onLoadedData={() => setImageError(false)}>您的浏览器不支持视频播放</video>
          ) : (
            <Image
              src={imageData.src}
              alt={imageData.alt}
              title={imageData.alt}
              className="max-w-full h-auto rounded-lg shadow-sm"
              preview={{
                mask: <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-50 rounded p-1 flex items-center justify-center text-white text-sm">Click to View</div>
              }}
              onError={() => setImageError(true)}
              onLoad={() => setImageError(false)}
            />
          )}
          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center text-red-500">
                <X className="h-8 w-8 mx-auto mb-2" />
                <div className="text-sm">{imageData.isVideo ? '视频' : '图片'}加载失败</div>
                <div className="text-xs">{imageData.src}</div>
              </div>
            </div>
          )}
          {imageData.alt && !imageError && <div className="mt-2 text-sm text-gray-600 text-center italic">{imageData.alt}</div>}
        </div>
      ) : (
        <div className="image-placeholder border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer" onClick={startEditing}>
          <div className="text-gray-600 mb-2">{hasContent ? '⚠️ Markdown 语法错误' : '点击添加媒体'}</div>
          <div className="text-sm text-gray-400">格式: ![描述](图片/视频URL)</div>
          {hasContent && <div className="mt-2 font-mono text-xs text-gray-500 bg-gray-50 p-2 rounded">{cell.content}</div>}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="relative group" data-cell-id={cell.id}>
        <div
          className="image-cell"
          onMouseEnter={() => viewMode === "create" && setShowButtons(cell.id, true)}
          onMouseLeave={() => viewMode === "create" && setShowButtons(cell.id, false)}
        >
          <div className="flex-grow w-full relative">
            {/* 主渲染区域 */}
            {shouldShowLoading ? renderGenerationState() : isEditing ? renderEditState() : renderDisplayState()}

            {/* 工具栏 */}
            {viewMode === "create" && (
              <div className={`absolute -right-14 top-1 flex flex-col items-center transition-opacity duration-200 ${cellShowButtons || isEditing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {isEditing ? (
                  <button onClick={saveEdit} className="p-1.5 hover:bg-gray-200 rounded" title="保存"><Eye size={16} /></button>
                ) : (
                  <button onClick={startEditing} className="p-1.5 hover:bg-gray-200 rounded" title="编辑"><Edit3 size={16} /></button>
                )}
                <button onClick={() => deleteCell(cell.id)} className="p-1.5 hover:bg-gray-200 rounded text-red-500" title="删除"><Trash2 size={16} /></button>
              </div>
            )}
          </div>
        </div>
      </div>

    </>
  );
};

export default React.memo(ImageCell);