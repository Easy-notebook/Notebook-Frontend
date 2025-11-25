// AICommandInput.ant.responsive.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Input, Button, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { SendHorizontal } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  usePipelineStore,
  PIPELINE_STAGES,
} from '@/components/Scenario/Workflow/store/usePipelineStore';
import usePreStageStore from '@/components/Scenario/Workflow/store/preStageStore';
import { generalResponse } from '@/components/Scenario/Workflow/api';
import { useAIAgentStore, EVENT_TYPES } from '@Store/AIAgentStore';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import useStore from '@Store/notebookStore';
import useOperatorStore from '@Store/operatorStore';
import { createUserAskQuestionAction } from '@Store/actionCreators';
import useCodeStore from '@Store/codeStore';
import { FileService } from '@Services/notebook/FileService';
import { useAIPlanningContextStore } from '@/components/Scenario/Workflow/store/aiPlanningContext';

import type { UploadFile, AICommandInputProps, VDSQuestion } from './types';
import { FilePreviewList } from './FilePreviewList';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPT = '.csv,.xlsx,.xls,.pdf,.txt,.md,.jpg,.png,.jpeg,.doc,.docx,.ppt,.pptx';

const AICommandInput: React.FC<AICommandInputProps> = ({ files, setFiles }) => {
  const { t, i18n } = useTranslation();
  const { resolvedTheme } = useTheme();

  // -------- UI refs / state --------
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [input, setInput] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isMultiline, setIsMultiline] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // -------- Biz state --------
  const [isVDSMode, setIsVDSMode] = useState<boolean>(false);

  // Safely extract the underlying HTMLTextAreaElement from AntD's TextArea instance
  const extractHtmlTextArea = useCallback((node: unknown): HTMLTextAreaElement | null => {
    if (!node) return null;
    // AntD v5 wraps the native textarea inside resizableTextArea
    const anyNode = node as { resizableTextArea?: { textArea?: unknown } } | HTMLTextAreaElement;
    const inner = (anyNode as { resizableTextArea?: { textArea?: unknown } })?.resizableTextArea
      ?.textArea;
    if (inner instanceof HTMLTextAreaElement) return inner;
    if (anyNode instanceof HTMLTextAreaElement) return anyNode;
    return null;
  }, []);

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
  const sendOperation = useOperatorStore((s) => s.sendOperation);

  const { addAction, setIsLoading, setActiveView, actions, qaList, addQA } = useAIAgentStore();

  const {
    notebookId,
    viewMode,
    currentPhaseId,
    currentStepIndex,
    getCurrentViewCells,
    currentCellId,
    setIsRightSidebarCollapsed,
  } = useStore();

  // ---------- autosize 行数计算（控制单行/多行布局切换） ----------
  const calcIsMultiline = useCallback(() => {
    const el = taRef.current;
    if (!el) return;

    // 如果有文件，强制多行模式
    if (files.length > 0) {
      setIsMultiline(true);
      return;
    }

    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight || '22');
    const paddingTop = parseFloat(style.paddingTop || '0');
    const paddingBottom = parseFloat(style.paddingBottom || '0');
    const contentHeight = el.scrollHeight - paddingTop - paddingBottom;
    const rows = Math.round(contentHeight / lineHeight);
    setIsMultiline(rows > 1 || input.includes('\n'));
  }, [input, files.length]);

  useLayoutEffect(() => {
    calcIsMultiline();
  }, [input, files.length, calcIsMultiline]);

  // Keep the resize handler typed to satisfy AntD's onResize signature
  const handleTextAreaResize = useCallback(() => {
    calcIsMultiline();
  }, [calcIsMultiline]);

  // Force dark mode text color via DOM manipulation
  useEffect(() => {
    const textarea = taRef.current;
    if (textarea && resolvedTheme === 'dark') {
      textarea.style.color = '#4a5568';
      textarea.style.setProperty('color', '#4a5568', 'important');
      textarea.style.webkitTextFillColor = '#4a5568';
    } else if (textarea) {
      textarea.style.color = '';
      textarea.style.webkitTextFillColor = '';
    }
  }, [resolvedTheme, input]);

  // ---------- 根据 VDS 模式和文件变化重置预设问题 ----------
  useEffect(() => {
    if (!isVDSMode && files.length === 0) {
      setPresetQuestions(defaultPresetQuestions);
    }
  }, [isVDSMode, files.length, defaultPresetQuestions]);

  // ---------- 上传逻辑 ----------
  const processFiles = useCallback(
    async (selectedFiles: File[]) => {
      console.log('[DEBUG] AICommandInput - Processing files count:', selectedFiles.length);

      if (!selectedFiles.length) {
        console.log('[DEBUG] AICommandInput - No files selected, returning');
        return;
      }

      // Check file sizes
      const oversizedFile = selectedFiles.find((f) => f.size > MAX_SIZE);
      if (oversizedFile) {
        console.log(
          '[DEBUG] AICommandInput - File too large:',
          oversizedFile.name,
          oversizedFile.size
        );
        alert(
          `File ${oversizedFile.name} is too large. Maximum size allowed is ${MAX_SIZE / 1024 / 1024}MB`
        );
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const uploadConfig = {
        mode: 'unrestricted',
        allowedTypes: [
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
          '.ppt',
          '.pptx',
          '.txt',
          '.md',
        ],
        maxFileSize: MAX_SIZE,
        targetDir: 'assets',
      };
      console.log('[DEBUG] AICommandInput - Upload config created:', uploadConfig);

      // 确保有 notebookId
      let currentNotebookId = notebookId;
      console.log('[DEBUG] AICommandInput - Current notebookId from store:', currentNotebookId);

      console.log('[DEBUG] AICommandInput - Setting upload state to true');
      setIsUploading(true);

      try {
        console.log('[DEBUG] AICommandInput - Starting file upload with:', {
          notebookId: currentNotebookId || 'NEW',
          fileCount: selectedFiles.length,
          config: uploadConfig,
        });

        let result;
        if (currentNotebookId) {
          // Existing notebook: use upload_file
          result = await FileService.uploadFile(currentNotebookId, selectedFiles, uploadConfig);
        } else {
          // No notebook: use create_notebook_with_files
          result = await FileService.createNotebookWithFiles(selectedFiles, uploadConfig.targetDir);
        }

        console.log('[DEBUG] AICommandInput - Upload result:', result);

        if (result && (result as any).status === 'ok') {
          // Extract notebook_id from response (support both top-level and data-level)
          const newNotebookId =
            (result as any).notebook_id || (result.data && (result.data as any).notebook_id);

          console.log(
            '[DEBUG] AICommandInput - File upload successful, received notebookId:',
            newNotebookId
          );

          if (newNotebookId) {
            currentNotebookId = newNotebookId;
            useStore.getState().setNotebookId(currentNotebookId!);
            // Assume kernel is ready or will be initialized by backend during creation
            useCodeStore.getState().setKernelReady(true);
            console.log('[DEBUG] AICommandInput - NotebookId updated in store:', currentNotebookId);
          } else if (currentNotebookId) {
            console.log('[DEBUG] AICommandInput - Using existing notebookId:', currentNotebookId);
          } else {
            console.warn(
              '[DEBUG] AICommandInput - No notebookId returned from upload and no existing ID'
            );
          }

          const newFiles: UploadFile[] = selectedFiles.map((file) => ({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            name: file.name,
            size: file.size,
            type: file.type,
            url: URL.createObjectURL(file),
            file: file,
          }));

          console.log('[DEBUG] AICommandInput - Setting files state:', newFiles);
          setFiles(newFiles);

          // Check for CSV/Excel for VDS mode
          const csv = selectedFiles.find((f) => /\.(csv|xlsx|xls)$/i.test(f.name));

          // Enable VDS mode for ANY file
          console.log('[DEBUG] AICommandInput - Enabling VDS mode for uploaded files');
          setIsVDSMode(true);

          if (csv) {
            console.log(
              '[DEBUG] AICommandInput - CSV/Excel found, initializing VDS mode:',
              csv.name
            );
            console.log('[DEBUG] AICommandInput - Setting current file in preStageStore');
            await usePreStageStore.getState().setCurrentFile(csv);
            const csvFilePath = `assets/${csv.name}`;
            console.log('[DEBUG] AICommandInput - Setting CSV file path:', csvFilePath);
            await usePreStageStore.getState().setCsvFilePath(csvFilePath);

            // 生成 VDS 预设问题（异步延时保持原逻辑）
            console.log('[DEBUG] AICommandInput - Starting question generation timer');
            setTimeout(async () => {
              try {
                console.log('[DEBUG] AICommandInput - Getting file columns and dataset info');
                const cols = usePreStageStore.getState().getFileColumns();
                const info = usePreStageStore.getState().getDatasetInfo();
                console.log('[DEBUG] AICommandInput - File columns:', cols);
                console.log('[DEBUG] AICommandInput - Dataset info:', info);

                console.log(
                  '[DEBUG] AICommandInput - Calling generalResponse for question generation'
                );
                const map = await generalResponse(
                  'generate_question_choice_map',
                  { column_info: cols, dataset_info: info },
                  i18n.language
                );
                console.log('[DEBUG] AICommandInput - Question generation result:', map);

                if (map?.message) {
                  console.log('[DEBUG] AICommandInput - Updating choice map and preset questions');
                  usePreStageStore.getState().updateChoiceMap(map.message);
                  setPresetQuestions(map.message as VDSQuestion[]);
                  if (
                    (map.message as VDSQuestion[]).length &&
                    (map.message as VDSQuestion[])[0].problem_description
                  ) {
                    const firstQuestion = (map.message as VDSQuestion[])[0].problem_description;
                    console.log(
                      '[DEBUG] AICommandInput - Setting input to first question:',
                      firstQuestion
                    );
                    setInput((prev) => (prev.trim() ? prev : firstQuestion));
                  }

                  // 生成预设问题后，自动跳转到 ProblemDefine 页面
                  console.log(
                    '[DEBUG] AICommandInput - File uploaded and questions generated, navigating to ProblemDefine'
                  );
                  setTimeout(async () => {
                    setPreStage(PIPELINE_STAGES.PROBLEM_DEFINE);
                    console.log(
                      '[DEBUG] AICommandInput - Questions generated, waiting for user input'
                    );
                  }, 500);
                } else {
                  console.log('[DEBUG] AICommandInput - No questions generated from response');
                }
              } catch (genErr) {
                console.error(
                  '[DEBUG] AICommandInput - Error generating preset questions:',
                  genErr
                );
              }
            }, 1000);
          } else {
            console.log(
              '[DEBUG] AICommandInput - No CSV/Excel found, using first file for VDS context'
            );
            const firstFile = selectedFiles[0];
            await usePreStageStore.getState().setCurrentFile(firstFile);
            const filePath = `assets/${firstFile.name}`;
            await usePreStageStore.getState().setCsvFilePath(filePath);

            // Set default suggestion for non-CSV files
            const defaultQuestion = 'Analyze this file';
            setInput((prev) => (prev.trim() ? prev : defaultQuestion));

            // Navigate to ProblemDefine
            setTimeout(async () => {
              setPreStage(PIPELINE_STAGES.PROBLEM_DEFINE);
            }, 500);
          }
        } else {
          console.error('[DEBUG] AICommandInput - Upload failed with result:', result);
          alert('Upload failed: ' + ((result as any)?.message || 'Unknown error'));
        }
      } catch (err: any) {
        console.error('[DEBUG] AICommandInput - Upload error:', err);
        console.error('[DEBUG] AICommandInput - Error stack:', err.stack);
        alert(t('emptyState.uploadError') || 'Upload failed: ' + err.message);
      } finally {
        console.log('[DEBUG] AICommandInput - Setting upload state to false');
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        console.log('[DEBUG] AICommandInput - File input cleared');
      }
    },
    [notebookId, i18n.language, t, setFiles, setPreStage]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      console.log('[DEBUG] AICommandInput - File upload initiated');
      const selectedFiles = Array.from(e.target.files ?? []);
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
      setFiles((prev) => {
        const newFiles = prev.filter((f) => f.id !== fileId);
        if (newFiles.length === 0) {
          setIsVDSMode(false);
        }
        return newFiles;
      });
    },
    [setFiles]
  );

  const onFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ---------- 提交逻辑 ----------
  const handleSubmit = useCallback(
    (command: string) => {
      if (!command) return;
      setIsLoading(true);
      const timestamp = new Date().toLocaleTimeString();

      try {
        // VDS：直接启动工作流
        const csvFile = files.find((f) => /\.(csv|xlsx|xls)$/i.test(f.name));
        const hasFiles = files.length > 0;

        if (hasFiles && isVDSMode && command.trim()) {
          console.log('[AICommandInput] VDS mode - Starting workflow directly');

          usePreStageStore.getState().setSelectedProblem('vds', command.trim(), 'VDS Analysis');

          // Use CSV file if available, otherwise use the first file
          const currentFile = csvFile || files[0];
          const preStageState = usePreStageStore.getState();

          const planningRequest = {
            problem_name: 'VDS Analysis',
            user_goal: command.trim(),
            problem_description: command.trim(),
            context_description: preStageState.datasetInfo || 'No additional context provided',
            csv_file_path: currentFile?.name ? `assets/${currentFile.name}` : '',
          };

          // Add variables to AI planning context
          const aiPlanningStore = useAIPlanningContextStore.getState();
          Object.entries(planningRequest).forEach(([key, value]) => {
            aiPlanningStore.addVariable(key, value as unknown as Record<string, unknown>);
          });

          // Start workflow immediately using new architecture
          (async () => {
            try {
              console.log('[AICommandInput] Starting workflow with new architecture...');
              const { useWorkflowStateMachine } = await import(
                '@/components/Scenario/Workflow/store/workflowStateMachine'
              );

              // ✅ NEW ARCHITECTURE: Use useWorkflowStateMachine.startWorkflow()
              // This replaces the deprecated initializeWorkflow() and startWorkflowExecution()
              console.log('[AICommandInput] Planning request:', planningRequest);

              await useWorkflowStateMachine.getState().startWorkflow(planningRequest);
              console.log('[AICommandInput] Workflow started successfully via new architecture');

              // Navigation will be handled automatically by useNotebookEffects
              // after workflow execution completes and isExecuting becomes false
              console.log(
                '[AICommandInput] Workflow execution in progress, navigation will happen automatically'
              );
            } catch (error) {
              console.error('[AICommandInput] Failed to start workflow:', error);
            }
          })();

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
            },
          });
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
          useAIAgentStore.getState().addAction(action);

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
          sendOperation(useStore.getState().notebookId, finalPayload);
          console.log('[DEBUG] AICommandInput - user_question operation sent successfully');
        }

        setFiles([]);
      } catch (err) {
        console.error('Submit error:', err);
      } finally {
        // 与原行为一致：稍后关闭 loading
        setTimeout(() => setIsLoading(false), 500);
      }
    },
    [
      files,
      isVDSMode,
      setIsLoading,
      setActiveView,
      addAction,
      addQA,
      sendOperation,
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

  // const hasContent = useMemo(() => input.trim().length > 0 || files.length > 0, [input, files.length]);

  return (
    <div className="relative mb-6">
      {/* 胶囊外框 */}
      <div
        className="ai-bar"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'relative',
          borderRadius: 28,
          border: `1px solid ${
            isDragOver
              ? 'rgba(255,255,255,0.5)'
              : isFocused
                ? 'rgba(255,255,255,0.2)'
                : 'rgba(255,255,255,0.1)'
          }`,
          boxShadow:
            isDragOver || isFocused ? '0 4px 18px rgba(0,0,0,0.08)' : '0 1px 6px rgba(0,0,0,0.04)',
          transition: 'transform .18s, box-shadow .18s, border-color .18s',
          transform: isFocused || isDragOver ? 'scale(1.01)' : 'none',
          isolation: 'isolate',
          overflow: 'hidden',
        }}
      >
        {/* Backdrop blur layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 28,
            backdropFilter: isFocused ? 'blur(30px) saturate(180%)' : 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: isFocused
              ? 'blur(30px) saturate(180%)'
              : 'blur(20px) saturate(160%)',
            transition: 'backdrop-filter .18s',
          }}
        />

        {/* Tint overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 28,
            backgroundColor: isFocused ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.6)',
            transition: 'background-color .18s',
          }}
        />

        {/* Luminosity layer for depth */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 28,
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%)',
            mixBlendMode: 'overlay',
          }}
        />

        {/* Noise texture */}
        <div
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            inset: 0,
            borderRadius: 28,
            opacity: 0.15,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4.2' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundSize: '200px 200px',
            mixBlendMode: 'soft-light',
          }}
        />

        {/* 文件预览列表 - 显示在输入框内部顶部 */}
        {files.length > 0 && (
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              padding: '12px 12px 0 12px',
            }}
          >
            <FilePreviewList files={files} onRemove={handleRemoveFile} />
          </div>
        )}

        {/* 顶部主行（单行：含左右按钮；多行：仅输入） */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            padding: isMultiline ? '10px 10px 0px 10px' : '10px 70px 10px 32px',
            border: 'none !important',
            outline: 'none !important',
          }}
        >
          {/* 单行：左侧 + */}
          {!isMultiline && (
            <div
              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}
            >
              <Tooltip title={isUploading ? t('emptyState.uploading') : t('emptyState.upload')}>
                <Button
                  type="text"
                  shape="circle"
                  icon={<PlusOutlined />}
                  onClick={() => !isUploading && onFileUpload()}
                  loading={isUploading}
                  style={{
                    color: resolvedTheme === 'dark' ? '#4a5568' : undefined,
                  }}
                />
              </Tooltip>
              {/* 文件 input —— 沿用原 handleFileChange */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept={ACCEPT}
                multiple
              />
            </div>
          )}

          {/* TextArea —— 无边框、autosize、自适应行数 */}
          <Input.TextArea
            ref={(node) => {
              taRef.current = extractHtmlTextArea(node);
            }}
            className="ai-bar-textarea ai-bar borderless-textarea"
            variant="borderless"
            styles={{
              textarea: {
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                background: 'transparent',
                caretColor: resolvedTheme === 'dark' ? '#1e6048' : '#2d7a5c',
                color: resolvedTheme === 'dark' ? '#4a5568' : 'inherit',
              },
            }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) {
                  handleSubmit(input.trim());
                  setInput('');
                }
              }
              // 延迟执行以获取最新 scrollHeight
              setTimeout(calcIsMultiline, 0);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onResize={handleTextAreaResize}
            autoSize={{ minRows: 1, maxRows: 12 }}
            placeholder={
              isVDSMode
                ? 'VDS模式 - 描述您想对数据进行的分析...'
                : input && input.startsWith('/')
                  ? t('emptyState.commandPlaceholder')
                  : t('emptyState.questionPlaceholder')
            }
          />

          {/* 单行：右侧 发送 */}
          {!isMultiline && (
            <div
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              {/* <Button
                disabled={!hasContent}
                style={{
                  width: 48,
                  height: 24,
                  borderRadius: 12,
                  boxShadow: hasContent ? '0 6px 18px rgba(0,0,0,0.12)' : 'none',
                  // color: hasContent ? '#fff' : 'rgba(0,0,0,0.45)',
                }}
                className={`${
                  input.trim()
                    ? 'bg-theme-600 hover:bg-theme-700 text-white cursor-pointer hover:scale-105 active:scale-95 shadow-lg'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed scale-95'
                }`}
                onClick={() => {
                  if (input.trim()) {
                    handleSubmit(input.trim());
                    setInput('');
                  }
                }}
              >
                {input && input.startsWith('/') ? t('emptyState.executeBtnText') : t('emptyState.askBtnText')}
              </Button> */}
              <button
                type="button"
                onClick={() => {
                  if (input.trim()) {
                    handleSubmit(input.trim());
                    setInput('');
                  }
                }}
                disabled={!input.trim()}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-300 ease-in-out text-sm font-medium transform ${
                  input.trim()
                    ? 'bg-theme-600 hover:bg-theme-700 text-white cursor-pointer hover:scale-105 active:scale-95 shadow-lg'
                    : resolvedTheme === 'dark'
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed scale-95'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed scale-95'
                }`}
              >
                <SendHorizontal className="w-4 h-4" />
                {input && input.startsWith('/')
                  ? t('emptyState.executeBtnText')
                  : t('emptyState.askBtnText')}
              </button>
            </div>
          )}
        </div>

        {/* 多行：底部操作栏（左：+；右：发送） */}
        {isMultiline && (
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '6px 12px 10px',
            }}
          >
            {/* 底栏左：+ */}
            <Tooltip title={isUploading ? t('emptyState.uploading') : t('emptyState.upload')}>
              <Button
                type="text"
                shape="circle"
                icon={<PlusOutlined />}
                onClick={() => !isUploading && onFileUpload()}
                loading={isUploading}
                style={{
                  color: resolvedTheme === 'dark' ? '#4a5568' : undefined,
                }}
              />
            </Tooltip>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept={ACCEPT}
              multiple
            />

            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => {
                if (input.trim()) {
                  handleSubmit(input.trim());
                  setInput('');
                }
              }}
              disabled={!input.trim()}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all duration-300 ease-in-out text-sm font-medium transform ${
                input.trim()
                  ? 'bg-theme-600 hover:bg-theme-700 text-white cursor-pointer hover:scale-105 active:scale-95 shadow-lg'
                  : resolvedTheme === 'dark'
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed scale-95'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed scale-95'
              }`}
            >
              <SendHorizontal className="w-4 h-4" />
              {input && input.startsWith('/')
                ? t('emptyState.executeBtnText')
                : t('emptyState.askBtnText')}
            </button>
          </div>
        )}
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
