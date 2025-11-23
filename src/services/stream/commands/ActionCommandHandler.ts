/**
 * Action Command Handler - Integration layer for AI Terminal
 * Handles stream action commands in the AI terminal interface
 */

import { ActionCommandParser } from './ActionCommandParser';
import type { StreamActionContext } from '../types';
import useStore from '@Store/notebookStore';
import { getAllStreamActionTypes } from '../actions/base';

export class ActionCommandHandler {
  /**
   * Handle a command from AI Terminal
   * Returns true if the command was an action command, false otherwise
   */
  static async handleCommand(
    command: string,
    showToast: (options: { message: string; type: 'success' | 'error' | 'info' }) => Promise<void>
  ): Promise<boolean> {
    // Check if it's an action command
    if (!ActionCommandParser.isActionCommand(command)) {
      return false;
    }

    // Get notebook context
    const state = useStore.getState();
    const context: Partial<StreamActionContext> = {
      showToast,
      notebookId: state.notebookId,
      currentCellId: state.currentCellId,
      viewMode: state.viewMode,
      currentPhaseId: state.currentPhaseId,
      currentStepIndex: state.currentStepIndex,
    };

    // Execute the action command
    const result = await ActionCommandParser.executeActionCommand(command, context);

    // Show result to user
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
