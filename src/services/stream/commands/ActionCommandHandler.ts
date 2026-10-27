/**
 * Action Command Handler - Integration layer for AI Terminal
 * Handles stream action commands in the AI terminal interface
 */

import { ActionCommandParser, type ActionCommandResult } from './ActionCommandParser';
import { NotebookActionScope } from '@/services/notebook/NotebookActionScope';
import { describeError } from '@Utils/errors';
import type { StreamActionContext, ShowToastFunction } from '../types';
import useStore from '@Store/notebookStore';
import { getAllStreamActionTypes } from '../actions/base';
import { useAIAgentStore } from '@Store/AIAgentStore';

export class ActionCommandHandler {
  /**
   * Handle a command from AI Terminal
   * Returns true if the command was an action command, false otherwise
   */
  static async handleCommand(command: string, showToast: ShowToastFunction): Promise<boolean> {
    // Check if it's an action command
    if (!ActionCommandParser.isActionCommand(command)) {
      return false;
    }

    const scope = new NotebookActionScope();
    try {
      // Get notebook context
      const state = useStore.getState();
      const context: Partial<StreamActionContext> = {
        signal: scope.signal,
        showToast: async (toast) => {
          if (!scope.signal.aborted) await showToast(toast);
        },
        notebookId: state.notebookId ?? undefined,
        currentCellId: state.currentCellId ?? undefined,
        viewMode: state.viewMode,
        currentPhaseId: state.currentPhaseId ?? undefined,
        currentStepIndex: state.currentStepIndex,
      };

      // Log command to sidebar
      const aiAgentStore = useAIAgentStore.getState();

      // Open sidebar and switch to QA view
      useStore.getState().setIsRightSidebarCollapsed(false);
      if (scope.signal.aborted) return true;
      aiAgentStore.setActiveView('qa');
      if (scope.signal.aborted) return true;

      // Add User Question (Command)
      aiAgentStore.addQA({
        type: 'user',
        content: command,
        viewMode: state.viewMode,
        cellId: state.currentCellId ?? undefined,
        resolved: true,
      });

      if (scope.signal.aborted) return true;

      // Also log to history (optional, but good for tracking)
      const actionId = aiAgentStore.addAction({
        type: 'system_event',
        content: `Command: ${command}`,
        result: '',
        relatedQAIds: [],
        cellId: state.currentCellId,
        viewMode: state.viewMode,
        onProcess: true,
      });

      let result: ActionCommandResult;
      try {
        scope.begin();
        result = await ActionCommandParser.executeActionCommand(command, context);
        scope.signal.throwIfAborted();
      } catch (error) {
        result = {
          success: false,
          message: 'Failed to execute command',
          error: describeError(error),
        };
      }
      const outcome = result.success
        ? result.message
        : `Error: ${result.message}\n${result.error || ''}`;

      // Settle the admitted record before notification or other presentation work.
      aiAgentStore.updateAction(actionId, { onProcess: false, result: outcome });
      if (scope.signal.aborted) return true;

      // Add Assistant Answer (Result)
      aiAgentStore.addQA({
        type: 'assistant',
        content: outcome,
        viewMode: state.viewMode,
        cellId: state.currentCellId ?? undefined,
        resolved: true,
      });

      if (scope.signal.aborted) return true;

      // Show result to user via toast as well
      if (result.success) {
        // For help/list commands, show info toast
        const isInfoCommand =
          command.includes('--help') || command.trim() === '/help' || command.trim() === '/list';

        await showToast({
          message: result.message,
          type: isInfoCommand ? 'info' : 'success',
        });
        console.log('[ActionCommand] Success:', result);
      } else {
        await showToast({
          message: `${result.message}${result.error ? `\n${result.error}` : ''}`,
          type: 'error',
        });
        console.error('[ActionCommand] Error:', result);
      }

      return true;
    } finally {
      scope.dispose();
    }
  }

  /**
   * Get command suggestions for autocomplete
   */
  static getCommandSuggestions(partial: string): string[] {
    if (!partial.startsWith('/')) {
      return [];
    }

    const actionType = partial.substring(1).split(/\s+/)[0];

    // If just started typing
    if (!actionType) {
      return [
        '/help',
        '/list',
        '/update_view_mode',
        '/update_notebook_title',
        '/add_cell',
        '/tiptap_update',
        '/trigger_image_generation',
      ];
    }

    // Get all available actions
    const allActions = getAllStreamActionTypes();

    // Filter by partial match
    const suggestions = allActions
      .filter((action) => action.startsWith(actionType) || action.includes(actionType))
      .map((action) => `/${action}`)
      .slice(0, 10); // Limit to 10 suggestions

    // Add special commands if they match
    if ('help'.startsWith(actionType)) {
      suggestions.unshift('/help');
    }
    if ('list'.startsWith(actionType)) {
      suggestions.unshift('/list');
    }

    return suggestions;
  }
}
