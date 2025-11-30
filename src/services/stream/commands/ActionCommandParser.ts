/**
 * Action Command Parser - CLI-style command parser for stream actions
 *
 * Syntax: /<action_type> [arguments] [--flag value]
 *
 * Examples:
 *   /update_view_mode step
 *   /add_cell --type code --content "print('hello')"
 *   /tiptap_update --cellId 123 --content "New content" --replace true
 *   /update_notebook_title "My Notebook"
 *   /trigger_image_generation --prompt "A sunset" --commandId cmd-123
 *   /update_view_mode --help
 */

import { getStreamActionClass, getAllStreamActionTypes } from '../actions/base';
import type { StreamActionContext } from '../types';

export interface ActionCommandResult {
  success: boolean;
  message: string;
  error?: string;
  actionType?: string;
}

interface ParsedCommand {
  actionType: string;
  args: string[];
  flags: Record<string, any>;
}

export class ActionCommandParser {
  /**
   * Parse CLI-style command
   * /action_name arg1 arg2 --flag1 value1 --flag2 value2
   */
  static parseCommand(command: string): ParsedCommand | null {
    const trimmed = command.trim();

    if (!trimmed.startsWith('/')) {
      return null;
    }

    // Remove leading /
    const content = trimmed.substring(1);

    // Split by spaces, but preserve quoted strings
    const tokens = this.tokenize(content);

    if (tokens.length === 0) {
      return null;
    }

    const actionType = tokens[0];
    const args: string[] = [];
    const flags: Record<string, any> = {};

    let i = 1;
    while (i < tokens.length) {
      const token = tokens[i];

      if (token.startsWith('--')) {
        // Flag
        const flagName = token.substring(2);

        // Check if next token is a value or another flag
        if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
          const flagValue = this.parseValue(tokens[i + 1]);
          flags[flagName] = flagValue;
          i += 2;
        } else {
          // Boolean flag without value
          flags[flagName] = true;
          i += 1;
        }
      } else {
        // Positional argument
        args.push(token);
        i += 1;
      }
    }

    return {
      actionType,
      args,
      flags,
    };
  }

  /**
   * Tokenize command string, preserving quoted strings
   */
  private static tokenize(str: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * Parse value to appropriate type
   */
  private static parseValue(value: string): any {
    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

    // Try JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        // Not valid JSON, treat as string
      }
    }

    // String
    return value;
  }

  /**
   * Convert parsed command to payload
   */
  static commandToPayload(parsed: ParsedCommand): any {
    const { args, flags } = parsed;

    // Start with flags as base payload
    const payload: any = { ...flags };

    // Map common action types to their expected payload structure
    switch (parsed.actionType) {
      case 'update_view_mode':
        if (args[0]) payload.mode = args[0];
        break;

      case 'update_notebook_title':
        if (args[0]) payload.title = args[0];
        break;

      case 'update_current_phase':
        if (args[0]) payload.phaseId = args[0];
        break;

      case 'update_current_step_index':
        if (args[0]) payload.stepIndex = parseInt(args[0], 10);
        break;

      case 'set_current_cell':
      case 'delete_cell':
        if (args[0]) payload.cellId = args[0];
        break;

      case 'tiptap_update':
      case 'addNewContent2CurrentCell':
      case 'updateCurrentCellWithContent':
        if (args[0]) payload.content = args[0];
        break;

      case 'trigger_image_generation':
      case 'trigger_video_generation':
      case 'trigger_webpage_generation':
        if (args[0]) payload.prompt = args[0];
        break;

      case 'addCell2EndWithContent':
      case 'add_cell':
        // AddCellAction expects: type, description (or content), metadata
        // Keep type and content/description at top level, don't nest in cell object
        if (!payload.description && payload.content) {
          payload.description = payload.content;
        }
        if (!payload.description && args[0]) {
          payload.description = args[0];
        }
        if (!payload.type) {
          payload.type = 'markdown'; // Default type
        }
        break;

      case 'update_cell':
        // UpdateCellFullAction expects: cell object
        if (!payload.cell) {
          payload.cell = {
            type: payload.type || 'code',
            content: payload.content || args[0] || '',
            id: payload.id || payload.cellId || `cell-${Date.now()}`,
          };
          // Clean up redundant top-level fields
          delete payload.type;
          delete payload.content;
          delete payload.id;
        }
        break;

      case 'error':
      case 'set_error':
        if (args[0]) payload.error = args[0];
        break;

      case 'bug_analysis':
        // Support both positional arg and --flags for cellId
        if (args[0]) payload.cellId = args[0];
        if (flags.flags) payload.cellId = flags.flags;

        // Handle content
        if (flags.content) {
          payload.content = flags.content;
        } else if (flags.flags) {
          // If flags provided, args[0] is content
          payload.content = args[0] || 'No analysis content provided.';
        } else {
          // Positional: <id> <content>
          if (args.length >= 2) {
            payload.cellId = args[0];
            payload.content = args[1];
          } else {
            payload.content = 'No analysis content provided.';
          }
        }
        break;

      case 'update_code':
        // Support both positional arg and --flags for cellId
        if (args[0]) payload.cellId = args[0];
        if (flags.flags) payload.cellId = flags.flags;
        if (flags.cellId) payload.cellId = flags.cellId;

        // Handle content
        if (flags.content) {
          payload.content = flags.content;
        } else if (flags.flags || flags.cellId) {
          // If flags provided for ID, args[0] is content
          payload.content = args[0];
        } else {
          // Positional: <id> <content>
          if (args.length >= 2) {
            payload.cellId = args[0];
            payload.content = args[1];
          } else {
            // Fallback: maybe args[0] is content if ID is missing?
            // But usually update_code requires an ID.
            // Let's assume if only 1 arg, it might be content if ID is implicit (current cell),
            // but UpdateCodeAction logic handles finding last code cell if ID is missing.
            // So if 1 arg, treat as content.
            payload.content = args[0];
          }
        }
        break;

      case 'exec_new_version':
        // Support both positional arg and --flags for cellId
        if (args[0]) payload.cellId = args[0];
        if (flags.flags) payload.cellId = flags.flags;
        if (flags.cellId) payload.cellId = flags.cellId;
        break;

      default:
        // For unknown actions, use first arg as content if no flags provided
        if (args.length > 0 && Object.keys(flags).length === 0) {
          payload.content = args[0];
        }
        break;
    }

    return payload;
  }

  /**
   * Get help text for a specific action
   */
  static getActionHelp(actionType: string): string {
    const helpMap: Record<string, string> = {
      update_view_mode: `
Usage: /update_view_mode <mode>
       /update_view_mode --mode <mode>

Description: Switch between view modes

Arguments:
  mode              View mode (create/step/demo)

Flags:
  --mode <mode>     Alternative way to specify mode

Examples:
  /update_view_mode step
  /update_view_mode --mode create
      `.trim(),

      update_notebook_title: `
Usage: /update_notebook_title <title>
       /update_notebook_title --title <title>

Description: Update the notebook title

Arguments:
  title             The new notebook title

Flags:
  --title <title>   Alternative way to specify title

Examples:
  /update_notebook_title "My Data Analysis"
  /update_notebook_title --title "Research Notes"
      `.trim(),

      add_cell: `
Usage: /add_cell --type <type> --content <content>

Description: Add a new cell to the notebook

Flags:
  --type <type>         Cell type (code/markdown/hybrid)
  --content <content>   Cell content
  --id <id>             Optional cell ID
  --position <pos>      Position (start/end/number)

Examples:
  /add_cell --type code --content "print('hello')"
  /add_cell --type markdown --content "# Title" --position 0
      `.trim(),

      update_cell: `
Usage: /update_cell --cellId <id> [options]

Description: Update an existing cell

Flags:
  --cellId <id>         Target cell ID
  --content <content>   New content
  --type <type>         New cell type

Examples:
  /update_cell --cellId cell-123 --content "new code"
      `.trim(),

      tiptap_update: `
Usage: /tiptap_update <content> --cellId <id>
       /tiptap_update --cellId <id> --content <content>

Description: Update TipTap editor content

Arguments:
  content           Content to add/replace

Flags:
  --cellId <id>     Target cell ID
  --content <text>  Content to add/replace
  --replace <bool>  Replace (true) or append (false)

Examples:
  /tiptap_update --cellId cell-123 --content "New content" --replace true
  /tiptap_update "More content" --cellId cell-123
      `.trim(),

      trigger_image_generation: `
Usage: /trigger_image_generation <prompt>
       /trigger_image_generation --prompt <prompt> --commandId <id>

Description: Generate an image from a text prompt

Arguments:
  prompt            Image generation prompt

Flags:
  --prompt <text>   Image description
  --commandId <id>  Command tracking ID

Examples:
  /trigger_image_generation "A sunset over mountains"
  /trigger_image_generation --prompt "Abstract art" --commandId cmd-123
      `.trim(),

      trigger_video_generation: `
Usage: /trigger_video_generation <prompt>

Description: Generate a video from a text prompt

Arguments:
  prompt            Video generation prompt

Flags:
  --prompt <text>   Video description
  --commandId <id>  Command tracking ID

Examples:
  /trigger_video_generation "A time-lapse of a sunset"
      `.trim(),

      trigger_webpage_generation: `
Usage: /trigger_webpage_generation <prompt>

Description: Generate a webpage from a description

Arguments:
  prompt            Webpage description

Flags:
  --prompt <text>   Webpage description
  --commandId <id>  Command tracking ID

Examples:
  /trigger_webpage_generation "A portfolio page with contact form"
      `.trim(),

      delete_cell: `
Usage: /delete_cell <cellId>
       /delete_cell --cellId <id>

Description: Delete a cell

Arguments:
  cellId            Cell ID to delete

Flags:
  --cellId <id>     Cell ID to delete

Examples:
  /delete_cell cell-123
  /delete_cell --cellId cell-456
      `.trim(),

      clear_cells: `
Usage: /clear_cells

Description: Clear all cells from the notebook

Examples:
  /clear_cells
      `.trim(),

      clear_outputs: `
Usage: /clear_outputs

Description: Clear all cell outputs

Examples:
  /clear_outputs
      `.trim(),

      set_current_cell: `
Usage: /set_current_cell <cellId>

Description: Set the currently active cell

Arguments:
  cellId            Cell ID to select

Examples:
  /set_current_cell cell-123
      `.trim(),

      update_current_phase: `
Usage: /update_current_phase <phaseId>

Description: Update the current workflow phase

Arguments:
  phaseId           Phase ID to switch to

Examples:
  /update_current_phase phase-2
      `.trim(),

      update_current_step_index: `
Usage: /update_current_step_index <index>

Description: Update the current step index

Arguments:
  index             Step index (number)

Examples:
  /update_current_step_index 2
      `.trim(),
    };

    return (
      helpMap[actionType] ||
      `
Usage: /${actionType} [arguments] [--flags]

Description: ${actionType} action

Use /action list to see all available actions.

Common Flags:
  --help            Show this help message

Examples:
  /${actionType} --help
    `.trim()
    );
  }

  /**
   * Execute an action command
   */
  static async executeActionCommand(
    command: string,
    context: Partial<StreamActionContext>
  ): Promise<ActionCommandResult> {
    const parsed = this.parseCommand(command);

    if (!parsed) {
      return {
        success: false,
        message: 'Invalid command format',
        error: 'Command must start with /',
      };
    }

    let { actionType } = parsed;
    const normalizedType = this.normalizeActionName(actionType);

    console.log('[ActionCommandParser] Executing:', { command, parsed, normalizedType });

    // Handle --help flag
    if (parsed.flags.help) {
      console.log('[ActionCommandParser] Help flag detected:', parsed);
      return {
        success: true,
        message: this.getActionHelp(normalizedType),
        actionType: normalizedType,
      };
    }

    // Handle special commands
    if (normalizedType === 'help') {
      return {
        success: true,
        message: this.getGeneralHelp(),
      };
    }

    if (normalizedType === 'list') {
      const actions = getAllStreamActionTypes();
      return {
        success: true,
        message: `Available Actions (${actions.length}):\n\n${actions.map((a, i) => `${i + 1}. /${a}`).join('\n')}\n\nUse /<action> --help for details on a specific action.`,
      };
    }

    // Get the action class (try both original and normalized)
    let ActionClass = getStreamActionClass(actionType);
    if (!ActionClass) {
      ActionClass = getStreamActionClass(normalizedType);
      if (ActionClass) {
        // Use normalized name if found
        actionType = normalizedType;
        parsed.actionType = normalizedType;
      }
    }

    if (!ActionClass) {
      const suggestions = this.getSuggestions(normalizedType);
      return {
        success: false,
        message: `Unknown action: /${actionType}`,
        error:
          suggestions.length > 0
            ? `Did you mean: ${suggestions.join(', ')}?`
            : 'Use /list to see all available actions',
        actionType,
      };
    }

    try {
      // Convert command to payload
      const payload = this.commandToPayload(parsed);

      // Create full context
      const fullContext: StreamActionContext = {
        payload,
        showToast: context.showToast || (async () => {}),
        notebookId: context.notebookId || '',
        currentCellId: context.currentCellId,
        viewMode: context.viewMode,
        currentPhaseId: context.currentPhaseId,
        currentStepIndex: context.currentStepIndex,
      };

      // Execute the action
      const actionInstance = new ActionClass();
      await actionInstance.execute(fullContext);

      return {
        success: true,
        message: `✓ Executed: /${actionType}`,
        actionType,
      };
    } catch (error: any) {
      console.error(`[ActionCommand] Error executing ${actionType}:`, error);
      return {
        success: false,
        message: `Failed to execute /${actionType}`,
        error: error.message || String(error),
        actionType,
      };
    }
  }

  /**
   * Get command suggestions for typos
   */
  private static getSuggestions(actionType: string): string[] {
    const allActions = getAllStreamActionTypes();
    const suggestions: string[] = [];

    for (const action of allActions) {
      // Simple similarity check (starts with same letters or contains)
      if (
        action.startsWith(actionType.substring(0, 3)) ||
        action.includes(actionType) ||
        actionType.includes(action)
      ) {
        suggestions.push(`/${action}`);
      }
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Get general help text
   */
  private static getGeneralHelp(): string {
    return `
Stream Action Commands - CLI Interface

Usage:
  /<action> [arguments] [--flags]

Common Commands:
  /list                 List all available actions
  /help                 Show this help message
  /<action> --help      Show help for a specific action

Examples:
  /update_view_mode step
  /add_cell --type code --content "print('hello')"
  /tiptap_update --cellId cell-123 --content "New text" --replace true
  /trigger_image_generation "A beautiful sunset"
  /update_notebook_title "My Analysis"

Tips:
  - Use quotes for multi-word arguments: /update_notebook_title "My Title"
  - Flags start with --: --type code
  - Boolean flags: --replace true or just --replace
  - Use /list to see all ${getAllStreamActionTypes().length} available actions
    `.trim();
  }

  /**
   * Normalize action name (convert hyphens to underscores)
   */
  static normalizeActionName(actionType: string): string {
    return actionType.replace(/-/g, '_');
  }

  /**
   * Check if command is a stream action command
   */
  static isActionCommand(command: string): boolean {
    const trimmed = command.trim();
    if (!trimmed.startsWith('/')) {
      return false;
    }

    const actionType = trimmed.substring(1).split(/\s+/)[0];
    const normalized = this.normalizeActionName(actionType);

    // Special commands
    if (normalized === 'help' || normalized === 'list') {
      return true;
    }

    // Check if it's a registered action (try both original and normalized)
    const ActionClass = getStreamActionClass(actionType) || getStreamActionClass(normalized);
    return ActionClass !== null;
  }
}
