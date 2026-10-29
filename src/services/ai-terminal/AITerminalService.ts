import { attachmentUploadService } from './AttachmentUploadService';
import { useAIAgentStore } from '@Store/AIAgentStore';
import useOperatorStore from '@Store/operatorStore';
import { AgentMemoryService, AgentType } from '@Services/agentMemoryService';
import type { ShowToastFunction } from '@Services/stream/types';
import { ActionCommandHandler } from '@Services/stream/commands';
import { EVENT_TYPES } from '@Store/models/agent';
import { notebookConversation } from '../agent-cell/NotebookConversation';
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
      callbacks.setActiveView('qa');
      if (files.length) {
        throw new Error('Agent 输入暂不支持附件，请先将附件内容放入 notebook 后再提问');
      }
      return notebookConversation.submit(notebookId, command, (error) => {
        void callbacks.showToast({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
}

export const aiTerminalService = new AITerminalService();
