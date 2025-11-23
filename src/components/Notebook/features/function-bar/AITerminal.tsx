// moved to features/function-bar
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAIAgentStore, EVENT_TYPES } from '@Store/AIAgentStore';
import useStore from '@Store/notebookStore';
import useOperatorStore from '@Store/operatorStore';
import { createUserAskQuestionAction } from '@Store/actionCreators';
import { Command, Paperclip, X, FileText } from 'lucide-react';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import useCodeStore from '@Store/codeStore';
import { NotebookLifecycleService } from '@Services/notebook/NotebookLifecycleService';
import { FileService } from '@Services/notebook/FileService';

// File upload types
interface UploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  file: File;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [
  '.csv',
  '.xlsx',
  '.xls',
  '.jpg',
  '.png',
  '.jpeg',
  '.gif',
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.md',
];

const CommandInput: React.FC = () => {
  const {
    showCommandInput,
    setShowCommandInput,
    addAction,
    setIsLoading,
    setActiveView,
    actions,
    qaList,
    addQA,
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
  } = useStore();

  const [input, setInput] = useState('');
  const modalRef = useRef(null);
  const textareaRef = useRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [topPosition, setTopPosition] = useState('75%');
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

  // Handle escape key to close and click outside
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowCommandInput(false);
        setInput('');
        setFiles([]);
      }
    };

    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        setShowCommandInput(false);
        setInput('');
        setFiles([]);
      }
    };

    if (showCommandInput) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCommandInput, setShowCommandInput]);

  // Auto focus input when modal opens and calculate position
  useEffect(() => {
    if (showCommandInput && textareaRef.current) {
      textareaRef.current.focus();
    }

    // Calculate 75% of container height
    if (showCommandInput && containerRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const topPos = containerHeight * 0.75;
      setTopPosition(`${topPos}px`);
    }
  }, [showCommandInput]);

  // 监听输入变化自动调整高度
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // 从命令推断用户目标的辅助方法
  const _inferGoalsFromCommand = useCallback((command: string): string[] => {
    const inferredGoals: string[] = [];
    const lowerCommand = command.toLowerCase();

    // 基于命令模式推断目标
    if (
      lowerCommand.includes('plot') ||
      lowerCommand.includes('chart') ||
      lowerCommand.includes('图') ||
      lowerCommand.includes('画')
    ) {
      inferredGoals.push('data_visualization');
    }
    if (
      lowerCommand.includes('load') ||
      lowerCommand.includes('read') ||
      lowerCommand.includes('import') ||
      lowerCommand.includes('读取') ||
      lowerCommand.includes('加载')
    ) {
      inferredGoals.push('data_loading');
    }
    if (
      lowerCommand.includes('clean') ||
      lowerCommand.includes('process') ||
      lowerCommand.includes('transform') ||
      lowerCommand.includes('清理') ||
      lowerCommand.includes('处理')
    ) {
      inferredGoals.push('data_processing');
    }
    if (
      lowerCommand.includes('analyze') ||
      lowerCommand.includes('analysis') ||
      lowerCommand.includes('分析') ||
      lowerCommand.includes('统计')
    ) {
      inferredGoals.push('data_analysis');
    }
    if (
      lowerCommand.includes('model') ||
      lowerCommand.includes('train') ||
      lowerCommand.includes('predict') ||
      lowerCommand.includes('模型') ||
      lowerCommand.includes('训练')
    ) {
      inferredGoals.push('machine_learning');
    }
    if (
      lowerCommand.includes('save') ||
      lowerCommand.includes('export') ||
      lowerCommand.includes('output') ||
      lowerCommand.includes('保存') ||
      lowerCommand.includes('导出')
    ) {
      inferredGoals.push('data_export');
    }

    return inferredGoals;
  }, []);

  // 从问题推断用户目标的辅助方法
  const _inferGoalsFromQuestion = useCallback(
    (question: string): string[] => {
      // 使用相同的推断逻辑
      return _inferGoalsFromCommand(question);
    },
    [_inferGoalsFromCommand]
  );

  // File upload handlers
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files ?? []);
      if (!selectedFiles.length) return;

      setIsUploading(true);
      try {
        const validFiles: UploadFile[] = [];

        for (const file of selectedFiles) {
          // Validate file extension
          const ext = '.' + file.name.split('.').pop()?.toLowerCase();
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            alert(`File type not allowed: ${file.name}`);
            continue;
          }

          // Validate file size
          if (file.size > MAX_FILE_SIZE) {
            alert(`File too large (max 10MB): ${file.name}`);
            continue;
          }

          // Ensure notebookId exists
          let currentNotebookId = notebookId;
          if (!currentNotebookId) {
            currentNotebookId = await NotebookLifecycleService.initializeNotebook();
            useStore.getState().setNotebookId(currentNotebookId);
            useCodeStore.getState().setKernelReady(true);
          }

          // Initialize kernel
          await useCodeStore.getState().initializeKernel();

          // Upload file
          const uploadConfig = {
            mode: 'unrestricted',
            allowedTypes: ALLOWED_EXTENSIONS,
            maxFileSize: MAX_FILE_SIZE,
            targetDir: 'assets',
          };

          const result = await FileService.uploadFile(currentNotebookId!, [file], uploadConfig);

          if (result && (result as any).status === 'ok') {
            validFiles.push({
              id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              name: file.name,
              size: file.size,
              type: file.type,
              url: URL.createObjectURL(file),
              file,
            });
          }
        }

        setFiles((prev) => [...prev, ...validFiles]);
      } catch (err: any) {
        console.error('File upload error:', err);
        alert('Upload failed: ' + err.message);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [notebookId]
  );

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
    async (command) => {
      try {
        setShowCommandInput(false);
        setIsLoading(true);
        const timestamp = new Date().toLocaleTimeString();

        if (command.startsWith('/')) {
          setActiveView('script');
          const commandId = `action-${Date.now()}`;
          const actionData = {
            id: commandId,
            type: EVENT_TYPES.USER_NEW_INSTRUCTION,
            timestamp,
            content: command,
            result: '',
            relatedQAIds: [],
            cellId: currentCellId,
            viewMode,
            onProcess: false,
            attachedFiles: files,
          };
          addAction(actionData);

          // 准备Command Agent记忆上下文
          const commandMemoryContext = AgentMemoryService.prepareMemoryContextForBackend(
            notebookId,
            'command' as AgentType,
            {
              current_cell_id: currentCellId,
              related_cells: getCurrentViewCells(),
              related_actions: actionsToShow.map((action) => action.id),
              command_id: commandId,
              command_content: command,
            }
          );

          // 更新用户意图（从命令推断）
          AgentMemoryService.updateUserIntent(
            notebookId,
            'command' as AgentType,
            [command], // 用户明确表达的目标
            _inferGoalsFromCommand(command), // 从命令推断的目标
            command, // 当前焦点
            [] // 当前阻塞
          );

          // 记录命令交互启动
          AgentMemoryService.recordOperationInteraction(
            notebookId,
            'command' as AgentType,
            'command_started',
            true,
            {
              command_id: commandId,
              command: command,
              start_time: new Date().toISOString(),
              related_context: {
                current_cell_id: currentCellId,
                related_actions_count: actionsToShow.length,
                view_mode: viewMode,
              },
            }
          );

          useOperatorStore.getState().sendOperation(notebookId, {
            type: 'user_command',
            payload: {
              current_view_mode: viewMode,
              current_phase_id: currentPhaseId,
              current_step_index: currentStepIndex,
              content: command,
              commandId: commandId,
              files,
              // 添加记忆上下文
              ...commandMemoryContext,
            },
          });
        } else {
          setIsRightSidebarCollapsed(true);
          setActiveView('qa');
          const qaId = `qa-${uuidv4()}`;
          const qaData = {
            id: qaId,
            type: 'user',
            timestamp,
            content: command,
            resolved: false,
            relatedActionId: null,
            cellId: currentCellId,
            viewMode,
            onProcess: true,
            attachedFiles: files,
          };
          addQA(qaData);
          const action = createUserAskQuestionAction(command, qaId, currentCellId);
          useAIAgentStore.getState().addAction(action);

          // 准备Agent记忆上下文
          console.log('AITerminal: 准备记忆上下文', { notebookId, command });
          const memoryContext = AgentMemoryService.prepareMemoryContextForBackend(
            notebookId,
            'general' as AgentType,
            {
              current_cell_id: currentCellId,
              related_cells: getCurrentViewCells(),
              related_qa_ids: qasToShow.map((qa) => qa.id),
              current_qa_id: qaId,
              question_content: command,
            }
          );
          console.log('AITerminal: 记忆上下文准备完成', memoryContext);

          // 更新用户意图（从用户问题推断）
          AgentMemoryService.updateUserIntent(
            notebookId,
            'general' as AgentType,
            [command], // 用户明确表达的目标
            _inferGoalsFromQuestion(command), // 推断的目标
            command, // 当前焦点
            [] // 当前阻塞（如果有的话）
          );

          // 记录QA交互启动
          AgentMemoryService.recordOperationInteraction(
            notebookId,
            'general' as AgentType,
            'qa_started',
            true,
            {
              qa_id: qaId,
              question: command,
              start_time: new Date().toISOString(),
              related_context: {
                current_cell_id: currentCellId,
                related_qa_count: qasToShow.length,
                view_mode: viewMode,
              },
            }
          );

          const finalPayload = {
            type: 'user_question',
            payload: {
              content: command,
              QId: [qaId],
              current_view_mode: viewMode,
              current_phase_id: currentPhaseId,
              current_step_index: currentStepIndex,
              related_qas: qasToShow,
              related_actions: actionsToShow,
              related_cells: getCurrentViewCells(),
              files,
              // 添加记忆上下文
              ...memoryContext,
            },
          };
          console.log('AITerminal: 发送最终payload', finalPayload);
          useOperatorStore.getState().sendOperation(notebookId, finalPayload);
        }

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
      setShowCommandInput,
      setIsLoading,
      setActiveView,
      addAction,
      addQA,
      qasToShow,
      actionsToShow,
      getCurrentViewCells,
      setIsRightSidebarCollapsed,
      _inferGoalsFromCommand,
      _inferGoalsFromQuestion,
      files,
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

  if (!showCommandInput) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-start justify-center z-[100] pointer-events-none"
      style={{ paddingTop: topPosition }}
    >
      <div
        className="w-4/5 max-w-5xl transform transition-all duration-200 rounded-3xl p-4 bg-black/3 dark:bg-white/3 pointer-events-auto"
        ref={modalRef}
        style={{
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
              accept={ALLOWED_EXTENSIONS.join(',')}
              multiple
            />
          </div>

          {/* Mode indicator */}
          {input && (
            <div className="relative z-10 px-6 pb-3">
              <div className="text-theme-600 dark:text-theme-400 font-medium text-sm">
                {input.startsWith('/') ? '⌘ Command mode' : '💭 Question mode'}
              </div>
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
