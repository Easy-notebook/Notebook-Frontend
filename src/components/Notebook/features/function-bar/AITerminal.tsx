// moved to features/function-bar
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useAIAgentStore } from '@Store/AIAgentStore';
import useStore from '@Store/notebookStore';
import { Command, Paperclip, X, FileText } from 'lucide-react';
import { CommandHintComponent } from './CommandHint';
import { aiTerminalService } from '@Services/ai-terminal/AITerminalService';
import { UploadFile } from '@Services/ai-terminal/types';

const CommandInput: React.FC = () => {
  const {
    showCommandInput,

    setIsLoading,
    setActiveView,
    actions,
    qaList,
  } = useAIAgentStore();

  const {
    currentCellId,
    viewMode,
    currentPhaseId,
    currentStepIndex,
    notebookId,
    getCurrentStepCellsIDs,
    getCurrentViewCells,
    setIsRightSidebarCollapsed,
    isRightSidebarCollapsed,
  } = useStore();

  const [input, setInput] = useState('');
  const modalRef = useRef(null);
  const textareaRef = useRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // 动态调整文本框高度
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // 重置高度以获取正确的scrollHeight
    textarea.style.height = 'auto';

    // 计算行数（hypothesis每行20px）
    const lineHeight = 24; // 基础行高
    const maxHeight = lineHeight * 4; // 4行的最大高度
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  // Filter actions based on view mode
  const actionsToShow = useMemo(() => {
    if (!viewMode) return [];

    return actions.filter((action) => {
      const isStepMode = viewMode === 'step';
      const isCompleteMode = viewMode === 'complete' || viewMode === 'create';
      const isOtherMode = !isStepMode && !isCompleteMode; // dslc, etc.

      // Always show system events (commands) for the current view mode
      if (action.type === 'system_event' && action.viewMode === viewMode) {
        return true;
      }

      // Step mode: only show actions for current step
      if (
        isStepMode &&
        action.viewMode === viewMode &&
        getCurrentStepCellsIDs().includes(action.cellId)
      ) {
        return true;
      }

      // Complete mode: show all complete mode actions
      if (isCompleteMode && action.viewMode === viewMode) {
        return true;
      }

      // Other modes: show all actions for that mode or general actions
      if (
        isOtherMode &&
        (action.viewMode === viewMode ||
          action.viewMode === 'complete' ||
          action.viewMode === 'create')
      ) {
        return true;
      }

      return false;
    });
  }, [actions, viewMode, getCurrentStepCellsIDs]);

  // Filter QAs based on view mode
  const qasToShow = useMemo(() => {
    if (!viewMode) return [];

    return qaList.filter((qa) => {
      const isStepMode = viewMode === 'step';
      const isCompleteMode = viewMode === 'complete' || viewMode === 'create';
      const isOtherMode = !isStepMode && !isCompleteMode; // dslc, etc.

      // Step mode: only show QAs for current step
      if (isStepMode && qa.viewMode === viewMode && getCurrentStepCellsIDs().includes(qa.cellId)) {
        return true;
      }

      // Complete mode: show all complete mode QAs
      if (isCompleteMode && qa.viewMode === viewMode) {
        return true;
      }

      // Other modes: show all QAs for that mode or general QAs
      if (isOtherMode && (qa.viewMode === viewMode || qa.viewMode === 'complete')) {
        return true;
      }

      return false;
    });
  }, [qaList, viewMode, getCurrentStepCellsIDs]);

  // Auto focus input when modal opens
  useEffect(() => {
    if (showCommandInput && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showCommandInput]);

  // 监听输入变化自动调整高度
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // File upload handlers
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    if (!selectedFiles.length) return;

    setIsUploading(true);
    try {
      const validFiles = await aiTerminalService.uploadFiles(selectedFiles);
      setFiles((prev) => [...prev, ...validFiles]);
    } catch (err: any) {
      console.error('File upload error:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (!droppedFiles.length) return;

      // Simulate file input change
      const fakeEvent = {
        target: { files: droppedFiles },
      } as any;
      await handleFileChange(fakeEvent);
    },
    [handleFileChange]
  );

  const handleSubmit = useCallback(
    async (command: string) => {
      try {
        setIsLoading(true);

        // Only open sidebar if it is currently closed and not a command
        if (!command.startsWith('/') && isRightSidebarCollapsed) {
          setIsRightSidebarCollapsed(false);
        }

        await aiTerminalService.processCommand(
          command,
          files,
          {
            notebookId: notebookId!,
            currentCellId,
            viewMode: viewMode!,
            currentPhaseId,
            currentStepIndex,
            actionsToShow,
            qasToShow,
            currentViewCells: getCurrentViewCells(),
          },
          {
            showToast: async (options) => {
              console.log(`[Toast ${options.type}]`, options.message);
            },
            setActiveView: (view) => setActiveView(view as any),
          }
        );

        // Clear files after successful submit
        setFiles([]);
      } catch (error) {
        console.error('Error in handleSubmit:', error);
      } finally {
        setTimeout(() => setIsLoading(false), 500);
      }
    },
    [
      notebookId,
      viewMode,
      currentPhaseId,
      currentStepIndex,
      currentCellId,
      setIsLoading,
      setActiveView,
      actionsToShow,
      qasToShow,
      getCurrentViewCells,
      files,
      isRightSidebarCollapsed,
      setIsRightSidebarCollapsed,
    ]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim()) {
          handleSubmit(input.trim());
          setInput('');
        }
      }
    },
    [input, handleSubmit, setInput]
  );

  // Auto focus input when modal opens
  useEffect(() => {
    if (showCommandInput && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showCommandInput]);

  // 监听输入变化自动调整高度
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  if (!showCommandInput) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 z-[100] pointer-events-none">
      <div
        className="absolute left-1/2 -translate-x-1/2 w-4/5 max-w-5xl transition-all duration-200 rounded-3xl p-4 bg-black/3 dark:bg-white/3 pointer-events-auto"
        ref={modalRef}
        style={{
          top: '75%',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Container with solid background */}
        <div
          className="relative rounded-3xl overflow-hidden bg-white dark:bg-gray-800"
          style={{
            boxShadow: isFocused ? '0 4px 18px rgba(0,0,0,0.12)' : '0 1px 6px rgba(0,0,0,0.08)',
            transition: 'transform .18s, box-shadow .18s',
            transform: isFocused ? 'scale(1.01)' : 'none',
            border: isDragging ? '2px dashed #2d7a5c' : 'none',
          }}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-theme-50/90 dark:bg-theme-900/90 flex items-center justify-center">
              <div className="text-theme-600 dark:text-theme-400 text-lg font-medium">
                Drop files here...
              </div>
            </div>
          )}

          {/* File preview list */}
          {files.length > 0 && (
            <div className="relative z-10 px-6 pt-4 pb-2">
              <div className="flex flex-wrap gap-2">
                {files.map((file) => {
                  const isImage = file.type.startsWith('image/');
                  return (
                    <div
                      key={file.id}
                      className="group relative flex items-center gap-2 p-2 pr-8 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      style={{ maxWidth: '200px' }}
                    >
                      {/* File icon/preview */}
                      <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                        {isImage ? (
                          <img
                            src={file.url}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        )}
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate"
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => handleRemoveFile(file.id)}
                        className="absolute right-1 top-1 p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                        title="Remove file"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="relative z-10 flex items-start gap-3 px-6 py-4">
            <Command
              className={`w-6 h-6 mt-1 flex-shrink-0 ${input.startsWith('/') ? 'text-theme-600 dark:text-theme-400' : 'text-theme-600 dark:text-theme-400'}`}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Type a command (start with /) or ask a question..."
              className={`
                mt-1 w-full text-xl border-none outline-none focus:ring-0 bg-transparent
                resize-none overflow-y-auto min-h-[24px] max-h-48 leading-7
                text-gray-800 dark:text-gray-200
                placeholder:text-gray-400 dark:placeholder:text-gray-500
                ${input.startsWith('/') ? 'font-mono' : 'font-normal'}
              `}
              rows={1}
              style={{
                wordWrap: 'break-word',
                whiteSpace: 'pre-wrap',
                caretColor: isFocused ? '#2d7a5c' : undefined,
              }}
            />

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept={aiTerminalService.ALLOWED_EXTENSIONS.join(',')}
              multiple
            />
          </div>

          {/* Mode indicator and Command Hints */}
          {input && (
            <div className="relative z-10 px-6 pb-3">
              <div className="text-theme-600 dark:text-theme-400 font-medium text-sm mb-2">
                {input.startsWith('/') ? '⌘ Command mode' : '💭 Question mode'}
              </div>

              {/* Show command hints for command mode */}
              {input.startsWith('/') && <CommandHintComponent input={input} />}
            </div>
          )}

          {/* Hints */}
          <div className="absolute right-6 top-4 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 z-10">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-1 hover:text-theme-600 dark:hover:text-theme-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Upload files"
            >
              <Paperclip className="w-3 h-3" />
              {isUploading ? 'Uploading...' : 'Attach'}
            </button>
            <span>|</span>
            <span>Shift + Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandInput;
