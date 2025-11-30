import { useAIAgentStore } from '@Store/AIAgentStore';
import useStore from '@Store/notebookStore';
import useOperatorStore from '@Store/operatorStore';
import useCodeStore from '@Store/codeStore';
import { NotebookLifecycleService } from '@Services/notebook/NotebookLifecycleService';
import { FileService } from '@Services/notebook/FileService';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import { ActionCommandHandler } from '@Services/stream/commands';
import { EVENT_TYPES } from '@Store/models/agent';
import { createUserAskQuestionAction } from '@Store/actionCreators';
import { v4 as uuidv4 } from 'uuid';
import { UploadFile, CommandContext } from './types';

class AITerminalService {
  public readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  public readonly ALLOWED_EXTENSIONS = [
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

  /**
   * Validate and upload files
   */
  async uploadFiles(files: File[]): Promise<UploadFile[]> {
    const validFiles: UploadFile[] = [];
    const notebookStore = useStore.getState();
    const codeStore = useCodeStore.getState();

    for (const file of files) {
      // Validate file extension
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
        throw new Error(`File type not allowed: ${file.name}`);
      }

      // Validate file size
      if (file.size > this.MAX_FILE_SIZE) {
        throw new Error(`File too large (max 10MB): ${file.name}`);
      }

      // Ensure notebookId exists
      let currentNotebookId = notebookStore.notebookId;
      if (!currentNotebookId) {
        const response = await NotebookLifecycleService.initializeNotebook();
        if (!response.notebook_id) {
          throw new Error('Failed to initialize notebook: No notebook ID returned');
        }
        currentNotebookId = response.notebook_id;
        notebookStore.setNotebookId(currentNotebookId);
        codeStore.setKernelReady(true);
      }

      // Initialize kernel
      await codeStore.initializeKernel();

      // Upload file
      const uploadConfig = {
        mode: 'unrestricted' as const,
        allowedTypes: this.ALLOWED_EXTENSIONS,
        maxFileSize: this.MAX_FILE_SIZE,
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

    return validFiles;
  }

  /**
   * Process user command or question
   */
  async processCommand(
    command: string,
    files: UploadFile[],
    context: CommandContext,
    callbacks: {
      showToast: (options: {
        message: string;
        type: 'success' | 'error' | 'info';
      }) => Promise<void>;
      setActiveView: (view: 'script' | 'qa') => void;
    }
  ): Promise<boolean> {
    const {
      notebookId,
      currentCellId,
      viewMode,
      currentPhaseId,
      currentStepIndex,
      actionsToShow,
      qasToShow,
      currentViewCells,
    } = context;

    const timestamp = new Date().toLocaleTimeString();

    if (command.startsWith('/')) {
      // Try to handle as action command first
      const isActionCommand = await ActionCommandHandler.handleCommand(
        command,
        callbacks.showToast
      );

      if (isActionCommand) {
        console.log('[AITerminal] Command handled by action system:', command);
        return true; // Handled
      }

      // Not an action command, proceed with original command handling
      callbacks.setActiveView('script');
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

      useAIAgentStore.getState().addAction(actionData);

      // Prepare Command Agent memory context
      const commandMemoryContext = AgentMemoryService.prepareMemoryContextForBackend(
        notebookId,
        'command' as AgentType,
        {
          current_cell_id: currentCellId ?? undefined,
          related_cells: currentViewCells,
          related_actions: actionsToShow.map((action) => action.id),
          command_id: commandId,
          command_content: command,
        }
      );

      // Update user intent
      AgentMemoryService.updateUserIntent(
        notebookId,
        'command' as AgentType,
        [command],
        [],
        command,
        []
      );

      // Record command interaction start
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
          ...commandMemoryContext,
        },
      });
    } else {
      // Question mode
      callbacks.setActiveView('qa');
      const qaId = `qa-${uuidv4()}`;
      const qaData = {
        id: qaId,
        type: 'user' as const,
        timestamp,
        content: command,
        resolved: false,
        relatedActionId: null,
        cellId: currentCellId ?? undefined,
        viewMode,
        onProcess: true,
        attachedFiles: files,
      };

      useAIAgentStore.getState().addQA(qaData);
      const action = createUserAskQuestionAction(command, [qaId], currentCellId);
      useAIAgentStore.getState().addAction(action);

      // Prepare Agent memory context
      console.log('AITerminal: Preparing memory context', { notebookId, command });
      const memoryContext = AgentMemoryService.prepareMemoryContextForBackend(
        notebookId,
        'general' as AgentType,
        {
          current_cell_id: currentCellId ?? undefined,
          related_cells: currentViewCells,
          related_qa_ids: qasToShow.map((qa) => qa.id),
          current_qa_id: qaId,
          question_content: command,
        }
      );
      console.log('AITerminal: Memory context ready', memoryContext);

      // Record QA interaction start
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
          related_cells: currentViewCells,
          files,
          ...memoryContext,
        },
      };
      console.log('AITerminal: Sending final payload', finalPayload);
      useOperatorStore.getState().sendOperation(notebookId, finalPayload);
    }

    return true;
  }
}

export const aiTerminalService = new AITerminalService();
