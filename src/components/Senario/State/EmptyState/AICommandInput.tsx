import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import {
  SendHorizontal,
  FileText,
  X,
  PlusCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

import { usePipelineStore, PIPELINE_STAGES } from '@/components/Senario/Workflow/store/usePipelineStore';
import usePreStageStore from '@/components/Senario/Workflow/store/preStageStore';
import { generalResponse } from '@/components/Senario/Workflow/services/StageGeneralFunction';
import { useAIAgentStore, EVENT_TYPES } from '@Store/AIAgentStore';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import useStore from '@Store/notebookStore';
import useOperatorStore from '@Store/operatorStore';
import { createUserAskQuestionAction } from '@Store/actionCreators';
import useCodeStore from '@Store/codeStore';
import { notebookApiIntegration } from '@Services/notebookServices';
import { useAIPlanningContextStore } from '@/components/Senario/Workflow/store/aiPlanningContext';

import { UploadFile, AICommandInputProps, VDSQuestion } from './types';

const AICommandInput: React.FC<AICommandInputProps> = ({ files, setFiles }) => {
  const { t, i18n } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isVDSMode, setIsVDSMode] = useState(false);

  const defaultPresetQuestions = useMemo(() => [
    {
      problem_name: "代码解释与优化",
      problem_description: "/explain 帮我解释这段代码的功能并提供优化建议"
    },
    {
      problem_name: "数据分析咨询",
      problem_description: "如何对我的数据进行统计分析？"
    },
    {
      problem_name: "代码生成",
      problem_description: "/gen 生成一个Python函数来处理数据"
    }
  ], []);
  
  const [presetQuestions, setPresetQuestions] = useState<VDSQuestion[]>(defaultPresetQuestions);

  const { setPreStage } = usePipelineStore();
  const sendOperation = useOperatorStore((s) => s.sendOperation);
  const {
    addAction,
    setIsLoading,
    setActiveView,
    actions,
    qaList,
    addQA,
  } = useAIAgentStore();
  const { notebookId, viewMode, currentPhaseId, currentStepIndex, getCurrentViewCells, currentCellId, setIsRightSidebarCollapsed } = useStore();

  // 调整文本域高度 - 所有情况下起始都是2行高度
  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lh = 24;
    const mh = lh * 2; // 固定为2行高度
    const nh = Math.min(ta.scrollHeight, mh);
    ta.style.height = `${nh}px`;
    ta.style.overflowY = ta.scrollHeight > mh ? 'auto' : 'hidden';
  }, []);
  useEffect(() => { adjustTextareaHeight(); }, [input, adjustTextareaHeight]);

  // 根据VDS模式状态动态显示预设问题
  useEffect(() => {
    if (!isVDSMode && files.length === 0) {
      setPresetQuestions(defaultPresetQuestions);
    }
  }, [isVDSMode, files.length, defaultPresetQuestions]);

  // 处理上传
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);
    if (!selectedFiles.length) return;
    const csv = selectedFiles.find(f => /\.(csv|xlsx|xls)$/i.test(f.name));
    if (!csv) {
      alert('Please select a CSV or Excel file');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (csv.size > maxSize) {
      alert(`File is too large. Maximum size allowed is ${maxSize / 1024 / 1024}MB`);
      return;
    }

    const uploadConfig = {
      mode: 'unrestricted',
      allowedTypes: ['.csv', '.xlsx', '.xls', '.jpg', '.png', '.jpeg', '.gif', '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.md'],
      maxFileSize: maxSize,
      targetDir: '.assets'
    };

    // 如果没有 notebookId，先创建一个
    let currentNotebookId = notebookId;
    if (!currentNotebookId) {
      try {
        currentNotebookId = await notebookApiIntegration.initializeNotebook();
        useStore.getState().setNotebookId(currentNotebookId);
        useCodeStore.getState().setKernelReady(true);
      } catch (initError) {
        console.error('Failed to create notebook:', initError);
        alert('Failed to create notebook. Please try again.');
        return;
      }
    }

    setIsUploading(true);

    try {
      await useCodeStore.getState().initializeKernel();
      const result = await notebookApiIntegration.uploadFiles(
        currentNotebookId!,
        [csv],
        uploadConfig,
      );
      if (result && (result as any).status === 'ok') {
        if (currentNotebookId !== notebookId) {
          useStore.getState().setNotebookId(currentNotebookId!);
        }
        const newFiles: UploadFile[] = [{
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          name: csv.name,
          size: csv.size,
          type: csv.type,
          url: URL.createObjectURL(csv),
          file: csv
        }];
        setFiles(newFiles);

        await usePreStageStore.getState().setCurrentFile(csv);
        await usePreStageStore.getState().setCsvFilePath(csv.name);

        setIsVDSMode(true);

        setTimeout(async () => {
          try {
            const cols = usePreStageStore.getState().getFileColumns();
            const info = usePreStageStore.getState().getDatasetInfo();
            const map = await generalResponse('generate_question_choice_map', { column_info: cols, dataset_info: info }, i18n.language);
            if (map?.message) {
              usePreStageStore.getState().updateChoiceMap(map.message);
              setPresetQuestions(map.message as VDSQuestion[]);
              if (map.message.length && map.message[0].problem_description) {
                setInput(map.message[0].problem_description);
              }
            }
          } catch (err) {
            console.error('Error generating preset questions:', err);
          }
        }, 1000);
      } else {
        alert('Upload failed: ' + ((result as any)?.message || 'Unknown error'));
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(t('emptyState.uploadError') || 'Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [notebookId, i18n.language, t, setFiles]);

  // 删除文件
  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => {
      const next = prev.filter(file => file.id !== fileId);
      if (next.length === 0) setIsVDSMode(false);
      return next;
    });
  }, [setFiles]);

  // 点击上传按钮
  const onFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // VDS模式切换处理
  const handleVDSToggle = useCallback(async () => {
    const newVDSMode = !isVDSMode;
    setIsVDSMode(newVDSMode);

    if (!newVDSMode) {
      setPresetQuestions(defaultPresetQuestions);
    } else if (files.length > 0) {
      const existingChoiceMap = usePreStageStore.getState().choiceMap as VDSQuestion[] | undefined;
      if (!existingChoiceMap || existingChoiceMap.length === 0) {
        try {
          const cols = usePreStageStore.getState().getFileColumns();
          const info = usePreStageStore.getState().getDatasetInfo();
          const map = await generalResponse('generate_question_choice_map', { column_info: cols, dataset_info: info }, i18n.language);
          if (map?.message) {
            usePreStageStore.getState().updateChoiceMap(map.message);
            setPresetQuestions(map.message as VDSQuestion[]);
          }
        } catch (err) {
          console.error('Error generating preset questions:', err);
          setPresetQuestions([]);
        }
      }
    }
  }, [isVDSMode, defaultPresetQuestions, files.length, i18n.language]);

  // 提交
  const handleSubmit = useCallback((command: string) => {
    if (!command) return;
    setIsLoading(true);
    const timestamp = new Date().toLocaleTimeString();

    try {
      // 仅 VDS 模式时进入 problem define
      const hasCsv = files.length > 0 && /\.(csv|xlsx|xls)$/i.test(files[0].name);
      if (hasCsv && isVDSMode && command.trim()) {
        usePreStageStore.getState().setSelectedProblem('vds', command.trim(), 'VDS Analysis');

        const currentFile = files[0];
        const variables = {
          csv_file_path: currentFile?.name || '',
          problem_description: command.trim(),
          context_description: 'No additional context provided',
          problem_name: 'VDS Analysis',
          user_goal: command.trim()
        };

        const aiPlanningStore = useAIPlanningContextStore.getState();
        Object.entries(variables).forEach(([key, value]) => {
          aiPlanningStore.addVariable(key, value);
        });

        setPreStage(PIPELINE_STAGES.PROBLEM_DEFINE);
        return;
      }

      // Command 模式
      if (command.startsWith('/')) {
        setActiveView('script');
        const commandId = `action-${Date.now()}`;
        const actionData = {
          id: commandId,
          type: EVENT_TYPES.USER_NEW_INSTRUCTION,
          timestamp,
          content: command,
          result: '',
          relatedQAIds: [] as string[],
          cellId: currentCellId,
          viewMode,
          onProcess: false,
          attachedFiles: files,
        };
        addAction(actionData as any);
        sendOperation(useStore.getState().notebookId, {
          type: 'user_command',
          payload: {
            current_view_mode: viewMode,
            current_phase_id: currentPhaseId,
            current_step_index: currentStepIndex,
            content: command,
            commandId,
            files,
          }
        });
      } else {
        // QA 模式
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
        addQA(qaData as any);
        const action = createUserAskQuestionAction(command, [qaId], currentCellId);
        useAIAgentStore.getState().addAction(action);

        const memoryContext = AgentMemoryService.prepareMemoryContextForBackend(
          useStore.getState().notebookId || '',
          'general' as AgentType,
          {
            current_cell_id: currentCellId ?? '',
            related_cells: getCurrentViewCells(),
            related_qa_ids: qaList.map(qa => qa.id),
            current_qa_id: qaId,
            question_content: command
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
            related_qas: qaList,
            related_actions: actions,
            related_cells: getCurrentViewCells(),
            files,
            ...memoryContext
          }
        };
        sendOperation(useStore.getState().notebookId, finalPayload);
      }

      setFiles([]);
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  }, [files, isVDSMode, setPreStage, setIsLoading, setActiveView, addAction, addQA, sendOperation, currentCellId, viewMode, currentPhaseId, currentStepIndex, qaList, actions, getCurrentViewCells, setIsRightSidebarCollapsed, setFiles]);

  // 键盘事件处理
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        handleSubmit(input.trim());
        setInput('');
      }
    }
  }, [input, handleSubmit]);

  return (
    <div className="relative mb-6">
      {/* 输入框容器 */}
      <div
        className={`
          relative rounded-full transition-all duration-300 ease-in-out
          border-0 margin-0 p-0 transform
          ${isFocused ? 'shadow-lg shadow-theme-200/50' : 'shadow-sm'}
          ${input && input.startsWith('/') ? 'bg-slate-50' : 'bg-white'}
          focus:outline-none border-2 transition-all duration-300
          ${isFocused ? 'border-theme-400 scale-[1.02]' : 'border-black'}
          ${input && input.startsWith('/') ? 'font-mono' : 'font-normal'}
          hover:shadow-md
        `}
      >
        <button
          type="button"
          onClick={onFileUpload}
          disabled={isUploading}
          className={`
            absolute left-3 top-7 -translate-y-1/2
            flex items-center justify-center px-2 py-1.5 rounded-full
            transition-all duration-300 ease-in-out transform
            `}
          aria-label="Upload file"
        >
          <PlusCircle className={`w-6 h-6 transition-all duration-300 ${
            isUploading ? 'animate-spin' : ''
          }`} />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".csv,.xlsx,.xls"
            multiple
          />
        </button>

        {/* 文本输入区域 */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={
            isVDSMode 
              ? 'VDS模式 - 描述您想对数据进行的分析...'
              : input && input.startsWith('/')
                ? t('emptyState.commandPlaceholder')
                : t('emptyState.questionPlaceholder')
          }
          className="w-full h-full pl-16 pr-36 py-3 pt-4 rounded-3xl text-base placeholder:text-gray-400 resize-none leading-6 focus:outline-none focus:ring-0"
          rows={1}
          style={{ wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}
        />

        {/* 提交按钮 */}
        <button
          type="button"
          onClick={() => {
            if (input.trim()) {
              handleSubmit(input.trim());
              setInput('');
            }
          }}
          disabled={!input.trim()}
          className={`
            absolute right-2 top-7 -translate-y-1/2
            flex items-center gap-1.5 px-4 py-1.5 rounded-full
            transition-all duration-300 ease-in-out text-sm font-medium transform
            ${input.trim()
              ? 'bg-theme-600 hover:bg-theme-700 text-white cursor-pointer hover:scale-105 active:scale-95 shadow-lg'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed scale-95'}
          `}
        >
          <SendHorizontal className="w-4 h-4" />
          {input && input.startsWith('/') ? t('emptyState.executeBtnText') : t('emptyState.askBtnText')}
        </button>

        {/* VDS模式切换开关 - 只有上传文件后才显示 */}
        {files.length > 0 && (
          <div className="absolute right-2 bottom-2 flex items-center gap-2 animate-fade-in">
            <span className={`text-xs transition-all duration-300 ${
              isVDSMode ? 'text-theme-600 font-medium' : 'text-gray-500'
            }`}>VDS Agents</span>
            <button
              onClick={handleVDSToggle}
              className={`
                relative inline-flex h-4 w-7 items-center rounded-full 
                transition-all duration-300 ease-in-out transform hover:scale-110 active:scale-95
                ${isVDSMode ? 'bg-theme-600 shadow-sm' : 'bg-gray-300 hover:bg-gray-400'}
              `}
              aria-pressed={isVDSMode}
              aria-label="Toggle VDS mode"
            >
              <span
                className={`
                  inline-block h-3 w-3 transform rounded-full bg-white 
                  transition-all duration-300 ease-out shadow-sm
                  ${isVDSMode ? 'translate-x-3.5 scale-110' : 'translate-x-0.5'}
                `}
              />
            </button>
          </div>
        )}

        {/* Shift + Enter 提示 */}
        {isFocused && (
          <div className="absolute -top-5 right-2 text-xs text-gray-400 bg-white px-2">
            {t('emptyState.pressShiftEnter')}
          </div>
        )}

        {/* 已上传文件列表 */}
        {files.length > 0 && (
          <div className="pl-2 mb-2 flex flex-wrap gap-2 animate-fade-in">
            {files.map((file: UploadFile, index) => (
              <div 
                key={file.id} 
                className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 rounded-3xl px-3 py-1.5 text-sm
                           transition-all duration-300 ease-in-out transform hover:scale-105 animate-slide-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <FileText className="w-4 h-4 text-gray-500 transition-colors duration-200" />
                <span className="truncate max-w-xs">{file.name}</span>
                <button
                  onClick={() => removeFile(file.id)}
                  className="ml-1 text-gray-400 hover:text-red-500 transition-all duration-300 
                           transform hover:scale-110 hover:rotate-90 active:scale-95"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 模式提示 */}
      {input && (
        <div className="mt-2 ml-10 animate-fade-in">
          <div className="text-theme-600 font-medium transition-all duration-300 ease-in-out transform hover:scale-105">
            {isVDSMode 
              ? `🤖 VDS Agents Mode`
              : input && input.startsWith('/') 
                ? `⌘ ${t('emptyState.commandMode')}` 
                : `💭 ${t('emptyState.questionMode')}`
            }
          </div>
        </div>
      )}

      {presetQuestions.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {presetQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => setInput(q.problem_description)}
              className="p-3 text-left bg-gray-50 hover:bg-gray-100 border rounded-xl transition-all group"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-theme-500 flex-shrink-0" />
                <span className="font-medium text-gray-800 text-sm truncate">{q.problem_name}</span>
                <ArrowRight className="w-3 h-3 text-gray-400 group-hover:text-theme-500 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AICommandInput;