import React from 'react';
import { Trash2, Eye, Edit3, X, Loader2 } from 'lucide-react';
import { Image } from 'antd';
import { Cell as StoreCell } from '@Store/models';
import { useImageCellViewModel } from './model/useImageCellViewModel';

interface ImageCellProps {
  cell: StoreCell;
}

const ImageCell: React.FC<ImageCellProps> = ({ cell }) => {
  const { vm, inputRef } = useImageCellViewModel(cell);

  const renderGenerationState = () => (
    <div className="relative p-4 rounded-lg border shadow-md group">
      {/* 动态背景 */}
      {!vm.generationError && (
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-theme-100 via-purple-100 to-pink-100 animate-pulse"></div>
          <div className="absolute inset-0 bg-white/60"></div>
        </div>
      )}

      {/* 内容容器 */}
      <div className="relative">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center space-x-2 text-xs">
            {vm.generationError ? (
              <div className="flex items-center space-x-2 text-red-600 font-semibold">
                <X className="w-4 h-4" />
                <span>生成失败</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin text-theme-500" />
                <span>正在生成 {vm.generationType === 'video' ? '视频' : '图片'}...</span>
              </div>
            )}
          </div>
          {!vm.generationError && (
            <div className="text-xs text-gray-500">
              已用时: {vm.formatElapsedTime(vm.elapsedTime)}
            </div>
          )}
        </div>

        {vm.generationError ? (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
            <div className="text-red-700 mb-3">{vm.generationError}</div>
            <button
              onClick={vm.handleClearError}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs font-semibold"
            >
              清除错误
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {vm.generationStatus && (
              <div className="text-xs text-theme-600 bg-theme-100 px-2 py-1 rounded inline-block">
                状态: {vm.generationStatus}
              </div>
            )}
            {vm.generationPrompt && (
              <div className="p-3 bg-white/70 backdrop-blur-sm rounded border border-gray-200">
                <div className="text-xs text-gray-500 font-medium mb-1">提示词:</div>
                <div className="text-sm text-gray-700">&quot;{vm.generationPrompt}&quot;</div>
              </div>
            )}
            {Object.keys(vm.generationParams).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {vm.generationParams.quality && (
                  <span className="px-2 py-1 bg-theme-100 text-theme-700 text-xs rounded font-medium">
                    质量: {vm.generationParams.quality}
                  </span>
                )}
                {vm.generationParams.ratio && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded font-medium">
                    比例: {vm.generationParams.ratio}
                  </span>
                )}
                {vm.generationParams.duration && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded font-medium">
                    时长: {vm.generationParams.duration}s
                  </span>
                )}
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
        value={vm.tempContent}
        onChange={(e) => vm.setTempContent(e.target.value)}
        onKeyDown={vm.handleKeyDown}
        onBlur={vm.handleBlur}
        placeholder="![图片描述](图片URL)"
        className="w-full p-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:border-theme-400"
      />
      {vm.previewData.isValid && vm.previewData.src ? (
        <div className="mt-3">
          {vm.previewData.isVideo ? (
            <video
              src={vm.previewData.src}
              controls
              className="max-w-full h-auto rounded-lg shadow-sm"
              onError={() => vm.setImageError(true)}
              onLoadedData={() => vm.setImageError(false)}
            >
              您的浏览器不支持视频播放
            </video>
          ) : (
            <Image
              src={vm.previewData.src}
              alt={vm.previewData.alt}
              className="max-w-full h-auto rounded-lg shadow-sm"
              preview={false}
              onError={() => vm.setImageError(true)}
              onLoad={() => vm.setImageError(false)}
            />
          )}
          {vm.imageError && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
              ⚠️ 加载失败: {vm.previewData.src}
            </div>
          )}
          {vm.previewData.alt && !vm.imageError && (
            <div className="mt-2 text-sm text-center italic">{vm.previewData.alt}</div>
          )}
        </div>
      ) : vm.tempContent ? (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
          ⚠️ 请检查 Markdown 语法: ![描述](URL)
        </div>
      ) : (
        <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm">
          输入 Markdown 语法以预览
        </div>
      )}
    </div>
  );

  const renderDisplayState = () => (
    <div className="image-display">
      {vm.imageData.isValid && vm.imageData.src ? (
        <div className="relative">
          {vm.imageData.isVideo || cell.metadata?.generationType === 'video' ? (
            <video
              src={vm.imageData.src}
              controls
              title={vm.imageData.alt}
              className="max-w-full h-auto rounded-lg shadow-sm"
              onError={() => vm.setImageError(true)}
              onLoadedData={() => vm.setImageError(false)}
            >
              您的浏览器不支持视频播放
            </video>
          ) : (
            <Image
              src={vm.imageData.src}
              alt={vm.imageData.alt}
              title={vm.imageData.alt}
              className="max-w-full h-auto rounded-lg shadow-sm"
              preview={{
                mask: (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-50 rounded p-1 flex items-center justify-center text-white text-sm">
                    Click to View
                  </div>
                ),
              }}
              onError={() => vm.setImageError(true)}
              onLoad={() => vm.setImageError(false)}
            />
          )}
          {vm.imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center text-red-500">
                <X className="h-8 w-8 mx-auto mb-2" />
                <div className="text-sm">{vm.imageData.isVideo ? '视频' : '图片'}加载失败</div>
                <div className="text-xs">{vm.imageData.src}</div>
              </div>
            </div>
          )}
          {vm.imageData.alt && !vm.imageError && (
            <div className="mt-2 text-sm text-gray-600 text-center italic">{vm.imageData.alt}</div>
          )}
        </div>
      ) : (
        <div
          className="image-placeholder border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
          onClick={vm.startEditing}
        >
          <div className="text-gray-600 mb-2">
            {vm.hasContent ? '⚠️ Markdown 语法错误' : '点击添加媒体'}
          </div>
          <div className="text-sm text-gray-400">格式: ![描述](图片/视频URL)</div>
          {vm.hasContent && (
            <div className="mt-2 font-mono text-xs text-gray-500 bg-gray-50 p-2 rounded">
              {cell.content}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="relative group" data-cell-id={cell.id}>
        <div
          className="image-cell"
          onMouseEnter={() => vm.viewMode === 'create' && vm.setShowButtons(true)}
          onMouseLeave={() => vm.viewMode === 'create' && vm.setShowButtons(false)}
        >
          <div className="flex-grow w-full relative">
            {/* 主渲染区域 */}
            {vm.shouldShowLoading
              ? renderGenerationState()
              : vm.isEditing
                ? renderEditState()
                : renderDisplayState()}

            {/* 工具栏 */}
            {vm.viewMode === 'create' && (
              <div
                className={`absolute -right-14 top-1 flex flex-col items-center transition-opacity duration-200 ${vm.cellShowButtons || vm.isEditing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                {vm.isEditing ? (
                  <button
                    onClick={vm.saveEdit}
                    className="p-1.5 hover:bg-gray-200 rounded"
                    title="保存"
                  >
                    <Eye size={16} />
                  </button>
                ) : (
                  <button
                    onClick={vm.startEditing}
                    className="p-1.5 hover:bg-gray-200 rounded"
                    title="编辑"
                  >
                    <Edit3 size={16} />
                  </button>
                )}
                <button
                  onClick={vm.deleteCell}
                  className="p-1.5 hover:bg-gray-200 rounded text-red-500"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default React.memo(ImageCell);
