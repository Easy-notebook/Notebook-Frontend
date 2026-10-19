import { attachmentUploadService } from './AttachmentUploadService';
import { useAIAgentStore } from '@Store/AIAgentStore';
import useOperatorStore from '@Store/operatorStore';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import type { ShowToastFunction } from '@Services/stream/types';
import { ActionCommandHandler } from '@Services/stream/commands';
import { EVENT_TYPES } from '@Store/models/agent';
import { createUserAskQuestionAction } from '@Store/actionCreators';
import { v4 as uuidv4 } from 'uuid';
import { UploadFile, CommandContext } from './types';

class AITerminalService {
  public readonly MAX_FILE_SIZE = attachmentUploadService.MAX_FILE_SIZE;
  public readonly ALLOWED_EXTENSIONS = attachmentUploadService.ALLOWED_EXTENSIONS;

  uploadFiles(files: File[]): Promise<UploadFile[]> {
    return attachmentUploadService.uploadFiles(files);
  }

  /**
   * Process user command or question
   */
  async processCommand(
    command: string,
    files: UploadFile[],
    context: CommandContext,
    callbacks: {
      showToast: ShowToastFunction;
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
      const actionData = {
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

      const commandId = useAIAgentStore.getState().addAction(actionData);

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

      const submission = await useOperatorStore.getState().submitOperation(notebookId, {
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
      if (!submission.accepted) useAIAgentStore.getState().removeAction(commandId);
      return submission.accepted;
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
      const questionActionId = useAIAgentStore.getState().addAction(action);

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
      const submission = await useOperatorStore
        .getState()
        .submitOperation(notebookId, finalPayload);
      if (!submission.accepted) {
        useAIAgentStore.getState().removeQA(qaId);
        useAIAgentStore.getState().removeAction(questionActionId);
      }
      return submission.accepted;
    }
  }
}

export const aiTerminalService = new AITerminalService();
