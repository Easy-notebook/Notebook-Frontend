/**
 * Command Hint Provider - Provides real-time hints and suggestions for commands
 */

import { ActionCommandParser } from './ActionCommandParser';
import { getAllStreamActionTypes } from '../actions/base';

export interface CommandHint {
  command: string;
  description: string;
  usage: string;
  examples: string[];
  flags?: Array<{
    name: string;
    description: string;
    type: string;
    required?: boolean;
  }>;
}

export class CommandHintProvider {
  /**
   * Get hint for partial command input
   */
  static getHint(input: string): CommandHint | null {
    const trimmed = input.trim();

    if (!trimmed.startsWith('/')) {
      return null;
    }

    // Extract command name (normalize hyphens to underscores)
    const parts = trimmed.substring(1).split(/\s+/);
    const commandName = ActionCommandParser.normalizeActionName(parts[0]);

    if (!commandName) {
      // Just typed '/', show general hint
      return {
        command: '/',
        description: 'Stream Action Commands',
        usage: '/<action> [arguments] [--flags]',
        examples: [
          '/list - Show all available commands',
          '/help - Show general help',
          '/add-cell --type code --content "..."',
          '/update-view-mode step',
        ],
      };
    }

    // Get hint for specific command
    return this.getCommandHint(commandName);
  }

  /**
   * Get detailed hint for a specific command
   */
  static getCommandHint(commandName: string): CommandHint | null {
    const hints: Record<string, CommandHint> = {
      help: {
        command: '/help',
        description: 'Show general help information',
        usage: '/help',
        examples: ['/help'],
      },

      list: {
        command: '/list',
        description: 'List all available stream actions',
        usage: '/list',
        examples: ['/list'],
      },

      add_cell: {
        command: '/add-cell',
        description: 'Add a new cell to the notebook',
        usage: '/add-cell --type <type> --content <content>',
        examples: [
          '/add-cell --type code --content "print(\'hello\')"',
          '/add-cell --type markdown --content "# Title"',
          '/add-cell "Quick note" --type markdown',
        ],
        flags: [
          { name: 'type', description: 'Cell type', type: 'code|markdown|hybrid', required: true },
          { name: 'content', description: 'Cell content', type: 'string', required: true },
          { name: 'position', description: 'Insert position', type: 'start|end|number' },
        ],
      },

      update_view_mode: {
        command: '/update-view-mode',
        description: 'Switch between view modes',
        usage: '/update-view-mode <mode>',
        examples: [
          '/update-view-mode step',
          '/update-view-mode create',
          '/update-view-mode --mode demo',
        ],
        flags: [
          { name: 'mode', description: 'View mode', type: 'create|step|demo', required: true },
        ],
      },

      update_notebook_title: {
        command: '/update-notebook-title',
        description: 'Update the notebook title',
        usage: '/update-notebook-title <title>',
        examples: [
          '/update-notebook-title "My Analysis"',
          '/update-notebook-title --title "Research Notes"',
        ],
        flags: [{ name: 'title', description: 'New title', type: 'string', required: true }],
      },

      tiptap_update: {
        command: '/tiptap-update',
        description: 'Update TipTap editor content',
        usage: '/tiptap-update --cellId <id> --content <text>',
        examples: [
          '/tiptap-update --cellId cell-123 --content "New text"',
          '/tiptap-update --cellId cell-123 --content "Text" --replace true',
          '/tiptap-update "Quick text" --cellId cell-123',
        ],
        flags: [
          { name: 'cellId', description: 'Target cell ID', type: 'string', required: true },
          {
            name: 'content',
            description: 'Content to add/replace',
            type: 'string',
            required: true,
          },
          { name: 'replace', description: 'Replace or append', type: 'boolean' },
        ],
      },

      delete_cell: {
        command: '/delete-cell',
        description: 'Delete a specific cell',
        usage: '/delete-cell <cellId>',
        examples: ['/delete-cell cell-123', '/delete-cell --cellId cell-456'],
        flags: [
          { name: 'cellId', description: 'Cell ID to delete', type: 'string', required: true },
        ],
      },

      clear_cells: {
        command: '/clear-cells',
        description: 'Clear all cells from notebook',
        usage: '/clear-cells',
        examples: ['/clear-cells'],
      },

      clear_outputs: {
        command: '/clear-outputs',
        description: 'Clear all cell outputs',
        usage: '/clear-outputs',
        examples: ['/clear-outputs'],
      },

      trigger_image_generation: {
        command: '/trigger-image-generation',
        description: 'Generate an image from text prompt',
        usage: '/trigger-image-generation <prompt>',
        examples: [
          '/trigger-image-generation "A beautiful sunset"',
          '/trigger-image-generation --prompt "Abstract art" --commandId cmd-123',
        ],
        flags: [
          { name: 'prompt', description: 'Image description', type: 'string', required: true },
          { name: 'commandId', description: 'Command tracking ID', type: 'string' },
        ],
      },

      trigger_video_generation: {
        command: '/trigger-video-generation',
        description: 'Generate a video from text prompt',
        usage: '/trigger-video-generation <prompt>',
        examples: ['/trigger-video-generation "Time-lapse of sunset"'],
        flags: [
          { name: 'prompt', description: 'Video description', type: 'string', required: true },
          { name: 'commandId', description: 'Command tracking ID', type: 'string' },
        ],
      },

      trigger_webpage_generation: {
        command: '/trigger-webpage-generation',
        description: 'Generate a webpage from description',
        usage: '/trigger-webpage-generation <prompt>',
        examples: ['/trigger-webpage-generation "Portfolio with gallery"'],
        flags: [
          { name: 'prompt', description: 'Webpage description', type: 'string', required: true },
        ],
      },

      update_current_phase: {
        command: '/update-current-phase',
        description: 'Switch to a different workflow phase',
        usage: '/update-current-phase <phaseId>',
        examples: ['/update-current-phase phase-2'],
        flags: [{ name: 'phaseId', description: 'Phase ID', type: 'string', required: true }],
      },

      update_current_step_index: {
        command: '/update-current-step-index',
        description: 'Update the current step index',
        usage: '/update-current-step-index <index>',
        examples: ['/update-current-step-index 3'],
        flags: [{ name: 'index', description: 'Step number', type: 'number', required: true }],
      },

      set_current_cell: {
        command: '/set-current-cell',
        description: 'Set the currently active cell',
        usage: '/set-current-cell <cellId>',
        examples: ['/set-current-cell cell-123'],
        flags: [
          { name: 'cellId', description: 'Cell ID to select', type: 'string', required: true },
        ],
      },

      runCurrentCodeCell: {
        command: '/runCurrentCodeCell',
        description: 'Execute the current code cell',
        usage: '/runCurrentCodeCell',
        examples: ['/runCurrentCodeCell'],
      },
    };

    return hints[commandName] || this.getGenericHint(commandName);
  }

  /**
   * Generate generic hint for commands without specific documentation
   */
  private static getGenericHint(commandName: string): CommandHint | null {
    const allActions = getAllStreamActionTypes();

    if (!allActions.includes(commandName)) {
      return null;
    }

    return {
      command: `/${commandName}`,
      description: `${commandName} action`,
      usage: `/${commandName} [arguments] [--flags]`,
      examples: [`/${commandName} --help  # Show detailed help`],
    };
  }

  /**
   * Get command suggestions based on partial input
   */
  static getSuggestions(partial: string): string[] {
    if (!partial.startsWith('/')) {
      return [];
    }

    const commandPart = ActionCommandParser.normalizeActionName(
      partial.substring(1).split(/\s+/)[0]
    );

    if (!commandPart) {
      // Show popular commands
      return [
        '/add-cell',
        '/update-view-mode',
        '/trigger-image-generation',
        '/clear-outputs',
        '/list',
        '/help',
      ];
    }

    const allActions = getAllStreamActionTypes();
    const matches = allActions
      .filter((action) => action.startsWith(commandPart) || action.includes(commandPart))
      .map((action) => `/${action.replace(/_/g, '-')}`);

    // Add special commands
    if ('help'.startsWith(commandPart)) matches.unshift('/help');
    if ('list'.startsWith(commandPart)) matches.unshift('/list');

    return matches.slice(0, 8);
  }
}
