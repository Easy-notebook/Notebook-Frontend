// AICommandInput.ant.responsive.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Input, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { SendHorizontal, LoaderCircle } from 'lucide-react';
import './AICommandInput.css';
import {
  usePipelineStore,
  PIPELINE_STAGES,
} from '@/components/Scenario/Workflow/store/usePipelineStore';
import usePreStageStore from '@/components/Scenario/Workflow/store/preStageStore';
import { generalResponse } from '@/components/Scenario/Workflow/api';
import { useAIAgentStore } from '@Store/AIAgentStore';
import { EVENT_TYPES } from '@Store/models/agent';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import useStore from '@Store/notebookStore';
import useOperatorStore from '@Store/operatorStore';
import { createUserAskQuestionAction } from '@Store/actionCreators';
import { emptyStateAttachmentUploadService } from '@Services/ai-terminal/EmptyStateAttachmentUploadService';
import { useAIPlanningContextStore } from '@/components/Scenario/Workflow/store/aiPlanningContext';

import type { AICommandInputProps, VDSQuestion } from './types';
import { FilePreviewList } from './FilePreviewList';
import { useEmptyStatePreparationSession } from './useEmptyStatePreparationSession';
import { useCommandDraft } from '@Hooks/useCommandDraft';

const ACCEPT = '.csv,.xlsx,.xls,.pdf,.txt,.md,.jpg,.png,.jpeg,.doc,.docx,.ppt,.pptx';

const AICommandInput: React.FC<AICommandInputProps> = ({ files, setFiles }) => {
  const { t, i18n } = useTranslation();

  // -------- UI refs / state --------
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const notebookId = useStore((state) => state.notebookId);
  const { commandDraft, input, setInput } = useCommandDraft(notebookId);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // -------- Biz state --------
  const [isVDSMode, setIsVDSMode] = useState<boolean>(false);

  const defaultPresetQuestions = useMemo<VDSQuestion[]>(
    () => [
      // { problem_name: '代码解释与优化', problem_description: '/explain 帮我解释这段代码的功能并提供优化建议' },
      // { problem_name: '数据分析咨询', problem_description: '如何对我的数据进行统计分析？' },
      // { problem_name: '代码生成', problem_description: '/gen 生成一个Python函数来处理数据' },
    ],
    []
  );
  const [presetQuestions, setPresetQuestions] = useState<VDSQuestion[]>(defaultPresetQuestions);

  const { setPreStage } = usePipelineStore();
  const submitOperation = useOperatorStore((s) => s.submitOperation);

  const { addAction, setActiveView, actions, qaList, addQA } = useAIAgentStore();

  const {
    viewMode,
    currentPhaseId,
    currentStepIndex,
    getCurrentViewCells,
    currentCellId,
    setIsRightSidebarCollapsed,
  } = useStore();

  // ---------- 根据 VDS 模式和文件变化重置预设问题 ----------
  useEffect(() => {
    if (files.length === 0) {
      setIsVDSMode(false);
      setPresetQuestions(defaultPresetQuestions);
    }
  }, [files.length, defaultPresetQuestions]);

  const preparation = useEmptyStatePreparationSession();

  const processFiles = useCallback(
    (selectedFiles: File[]) =>
      preparation.run(selectedFiles, {
        upload: (batch) => emptyStateAttachmentUploadService.uploadFiles(batch),
        accept: (attachments) => {
          setFiles(attachments);
          setIsVDSMode(true);
        },
        prepare: async (file) => {
          usePreStageStore.getState().setCsvFilePath(`assets/${file.name}`);
          await usePreStageStore.getState().setCurrentFile(file);
          // A later selection owns the Store; this continuation must not rewrite its path.
          const state = usePreStageStore.getState();
          if (state.currentFile !== file) throw new Error('Dataset selection changed');
          return { columns: [...state.getFileColumns()], info: state.getDatasetInfo() };
        },
        suggest: async (columns, info) => {
          const response = await generalResponse(
            'generate_question_choice_map',
            {
              column_info: columns,
              dataset_info: info,
            },
            i18n.language
          );
          return response?.message;
        },
        questions: (questions) => {
          usePreStageStore.getState().updateChoiceMap(questions);
          setPresetQuestions(questions);
          const first = questions[0]?.problem_description;
          if (first) setInput((previous) => (previous.trim() ? previous : first));
        },
        defaultQuestion: () =>
          setInput((previous) => (previous.trim() ? previous : 'Analyze this file')),
        navigate: () => setPreStage(PIPELINE_STAGES.PROBLEM_DEFINE),
        loading: setIsUploading,
        error: (error, stage) => {
          console.error(`[AICommandInput] ${stage} failed:`, error);
          if (stage === 'upload') alert(t('emptyState.uploadError') || String(error));
        },
      }),
    [preparation, i18n.language, t, setFiles, setPreStage, setInput]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files ?? []);
      e.target.value = '';
      await processFiles(selectedFiles);
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        await processFiles(droppedFiles);
      }
    },
    [processFiles]
  );

  const handleRemoveFile = useCallback(
    (fileId: string) => {
      preparation.cancel();
      setFiles((prev) => {
        const newFiles = prev.filter((f) => f.id !== fileId);
        if (newFiles.length === 0) {
          setIsVDSMode(false);
        }
        return newFiles;
      });
    },
    [setFiles, preparation]
  );

  const onFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ---------- 提交逻辑 ----------
  const handleSubmit = useCallback(
    async (command: string): Promise<boolean> => {
      if (!command) return false;
      preparation.cancel();
      const timestamp = new Date().toLocaleTimeString();

      // VDS：直接启动工作流
      const csvFile = files.find((f) => /\.(csv|xlsx|xls)$/i.test(f.name));
      const hasFiles = files.length > 0;

      if (hasFiles && isVDSMode && command.trim()) {
        console.log('[AICommandInput] VDS mode - Starting workflow directly');

        usePreStageStore.getState().setSelectedProblem('vds', command.trim(), 'VDS Analysis');

        // Use CSV file if available, otherwise use the first file
        const currentFile = csvFile || files[0];

        const planningRequest = {
          user_requirement: command.trim(),
          file_path: currentFile?.name ? `assets/${currentFile.name}` : '',
        };

        // Add variables to AI planning context
        const aiPlanningStore = useAIPlanningContextStore.getState();
        Object.entries(planningRequest).forEach(([key, value]) => {
          aiPlanningStore.addVariable(key, value as unknown as Record<string, unknown>);
        });

        const { useWorkflowStateMachine } = await import(
          '@/components/Scenario/Workflow/store/workflowStateMachine'
        );
        await useWorkflowStateMachine.getState().startWorkflow(planningRequest);
        return true;
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
        const recordedActionId = addAction(actionData as any);

        const submission = await submitOperation(useStore.getState().notebookId, {
          type: 'user_command',
          payload: {
            current_view_mode: viewMode,
            current_phase_id: currentPhaseId,
            current_step_index: currentStepIndex,
            content: command,
            commandId,
            files,
          },
        });
        if (!submission.accepted) {
          useAIAgentStore.getState().removeAction(recordedActionId);
          return false;
        }
      } else {
        // QA 模式
        console.log('[DEBUG] AICommandInput - Entering QA mode for question:', command);
        setIsRightSidebarCollapsed(false); // 打开右侧边栏以显示 QA
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
        const recordedActionId = useAIAgentStore.getState().addAction(action);

        const memoryContext = AgentMemoryService.prepareMemoryContextForBackend(
          useStore.getState().notebookId || '',
          'general' as AgentType,
          {
            current_cell_id: currentCellId ?? '',
            related_cells: getCurrentViewCells(),
            related_qa_ids: qaList.map((qa) => qa.id),
            current_qa_id: qaId,
            question_content: command,
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
            ...memoryContext,
          },
        };
        console.log('[DEBUG] AICommandInput - Sending user_question operation:', finalPayload);
        const submission = await submitOperation(useStore.getState().notebookId, finalPayload);
        if (!submission.accepted) {
          useAIAgentStore.getState().removeQA(qaId);
          useAIAgentStore.getState().removeAction(recordedActionId);
          return false;
        }
        console.log('[DEBUG] AICommandInput - user_question operation sent successfully');
      }

      const submittedIds = new Set(files.map((file) => file.id));
      setFiles((current) => current.filter((file) => !submittedIds.has(file.id)));
      return true;
    },
    [
      preparation,
      files,
      isVDSMode,
      setActiveView,
      addAction,
      addQA,
      submitOperation,
      currentCellId,
      viewMode,
      currentPhaseId,
      currentStepIndex,
      qaList,
      actions,
      getCurrentViewCells,
      setIsRightSidebarCollapsed,
      setFiles,
    ]
  );

  const submitInput = useCallback(() => {
    void commandDraft.submit(handleSubmit, (error) => console.error('Submit error:', error));
  }, [commandDraft, handleSubmit]);

  // const hasContent = useMemo(() => input.trim().length > 0 || files.length > 0, [input, files.length]);

  return (
    <div className="relative mb-6">
      <div
        className="ai-command-input"
        data-dragging={isDragOver || undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length > 0 && (
          <div className="ai-command-input__attachments">
            <FilePreviewList files={files} onRemove={handleRemoveFile} />
          </div>
        )}
        <div className="ai-command-input__row">
          <Tooltip title={isUploading ? t('emptyState.uploading') : t('emptyState.upload')}>
            <button
              type="button"
              className="ai-command-input__upload"
              aria-label={t('emptyState.upload')}
              disabled={isUploading}
              onClick={onFileUpload}
            >
              {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlusOutlined />}
            </button>
          </Tooltip>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept={ACCEPT}
            multiple
          />
          <Input.TextArea
            className="ai-command-input__textarea"
            variant="borderless"
            aria-label={t('emptyState.questionPlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (input.trim()) submitInput();
              }
            }}
            autoSize={{ minRows: 1, maxRows: 12 }}
            placeholder={
              isVDSMode
                ? 'VDS模式 - 描述您想对数据进行的分析...'
                : input.startsWith('/')
                  ? t('emptyState.commandPlaceholder')
                  : t('emptyState.questionPlaceholder')
            }
          />
          <button
            type="button"
            className="ai-command-input__send"
            onClick={submitInput}
            disabled={!input.trim()}
          >
            <SendHorizontal className="h-4 w-4" />
            {input.startsWith('/') ? t('emptyState.executeBtnText') : t('emptyState.askBtnText')}
          </button>
        </div>
      </div>

      {/* 模式提示（保留） */}
      {input && (
        <div className="mt-2 ml-10">
          <div className="text-theme-600 font-medium transition-all duration-300 ease-in-out">
            {isVDSMode
              ? `🤖 VDS Agents Mode`
              : input && input.startsWith('/')
                ? `⌘ ${t('emptyState.commandMode')}`
                : `💭 ${t('emptyState.questionMode')}`}
          </div>
        </div>
      )}

      {/* 预设问题（保留原样式） */}
      {presetQuestions.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {presetQuestions.map((q, idx) => (
            <button
              key={`${q.problem_name}-${idx}`}
              onClick={() => setInput(q.problem_description)}
              className="p-3 text-left bg-gray-50 hover:bg-gray-100 border rounded-xl transition-all group"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 text-sm truncate">{q.problem_name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AICommandInput;
