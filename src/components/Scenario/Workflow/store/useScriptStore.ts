/**
 * Script Store - Simplified for New Architecture
 * ================================================
 *
 * This store is now ONLY responsible for:
 * 1. Executing actions (adding cells, running code, etc.)
 * 2. Managing UI state (debug button, etc.)
 * 3. Tracking last added action
 *
 * All workflow logic is handled by:
 * - WorkflowStateMachine: FSM state tracking
 * - TransitionHandlers: State transitions
 * - API Handlers: API calls
 *
 * Ported from: ref/Notebook-BCC/stores/script_store.py (action execution only)
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// External dependencies
import useNotebookStore from '@Store/notebookStore';
import useCodeStore from '@Store/codeStore';
import { sendCurrentCellExecuteCodeError_should_debug } from '@Store/autoActions';
import { useAIPlanningContextStore } from './aiPlanningContext';

// ==============================================
// Types
// ==============================================

import type { ActionMetadata, ExecutionStep } from '@Store/models';

interface ScriptStoreState {
  debugButtonVisible: boolean;
  lastAddedActionId: string | null;
}

interface ScriptStoreActions {
  execAction: (step: ExecutionStep) => Promise<any>;

  // Specialized operations (called by action handlers)
  addCell: (
    cellType: string,
    content: string,
    metadata?: ActionMetadata,
    options?: any
  ) => string | null;
  updateLastText: (text: string) => void;
  finishThinking: () => void;
  setEffectAsThinking: (thinkingText?: string) => void;
  execCodeCell: (codecellId: string, needOutput?: boolean, autoDebug?: boolean) => Promise<any>;
  updateTitle: (title: string) => void;
}

export type ScriptStore = ScriptStoreState & ScriptStoreActions;

// ==============================================
// Constants
// ==============================================

const CELL_TYPE_MAPPING: Record<string, string> = {
  text: 'markdown',
  code: 'code',
  thinking: 'thinking',
};

const ACTION_TYPES = {
  ADD: 'add',
  IS_THINKING: 'is_thinking',
  FINISH_THINKING: 'finish_thinking',
  EXEC_CODE: 'exec',
  UPDATE_TITLE: 'update_title',
  NEW_CHAPTER: 'new_chapter',
  NEW_SECTION: 'new_section',
  NEW_STEP: 'new_step',
  UPDATE_LAST_TEXT: 'update_last_text',
  SET_EFFECT_THINKING: 'set_effect_as_thinking',
  COMMENT_RESULT: 'comment-result',
};

// ==============================================
// Helper Functions
// ==============================================

/**
 * Format action content for display in the right sidebar
 */
function formatActionContent(actionType: string, step: ExecutionStep): string {
  const params: string[] = [];

  // Add common parameters
  if (step.content) {
    const preview =
      step.content.length > 100 ? step.content.substring(0, 100) + '...' : step.content;
    params.push(`content: "${preview}"`);
  }

  // Add action-specific parameters
  switch (actionType) {
    case ACTION_TYPES.ADD:
      if (step.shotType) params.push(`shotType: ${step.shotType}`);
      if (step.metadata) params.push(`metadata: ${JSON.stringify(step.metadata)}`);
      break;

    case ACTION_TYPES.EXEC_CODE:
      if (step.codecell_id) params.push(`codecell_id: ${step.codecell_id}`);
      if (step.need_output !== undefined) params.push(`need_output: ${step.need_output}`);
      if (step.auto_debug !== undefined) params.push(`auto_debug: ${step.auto_debug}`);
      break;

    case ACTION_TYPES.UPDATE_TITLE:
      if (step.title) params.push(`title: "${step.title}"`);
      break;

    case ACTION_TYPES.NEW_CHAPTER:
    case ACTION_TYPES.NEW_SECTION:
    case ACTION_TYPES.NEW_STEP:
      if (step.text) params.push(`text: "${step.text}"`);
      break;

    case ACTION_TYPES.IS_THINKING:
      if (step.agentName) params.push(`agentName: ${step.agentName}`);
      if (step.thinkingText) params.push(`thinkingText: "${step.thinkingText}"`);
      break;

    case ACTION_TYPES.UPDATE_LAST_TEXT:
      if (step.text) params.push(`text: "${step.text}"`);
      break;
  }

  const paramsStr = params.length > 0 ? `\n  ${params.join('\n  ')}` : '';
  return `Action: ${actionType}${paramsStr}`;
}

/**
 * Format action result for display
 */
function formatActionResult(result: any): string {
  if (result === null || result === undefined) {
    return 'Action completed successfully';
  }

  if (typeof result === 'string') {
    return result.length > 200 ? result.substring(0, 200) + '...' : result;
  }

  if (typeof result === 'object') {
    try {
      const resultStr = JSON.stringify(result, null, 2);
      return resultStr.length > 200 ? resultStr.substring(0, 200) + '...' : resultStr;
    } catch {
      return String(result);
    }
  }

  return String(result);
}

// ==============================================
// Zustand Store
// ==============================================

export const useScriptStore = create<ScriptStore>((set, get) => ({
  // ==============================================
  // State
  // ==============================================
  debugButtonVisible: true,
  lastAddedActionId: null,

  // ==============================================
  // Main Action Executor
  // ==============================================
  execAction: async (step: ExecutionStep): Promise<any> => {
    if (!step?.action) {
      console.error('[ScriptStore] execAction requires step with action property');
      return;
    }

    const actionType = step.action;
    console.log(`[ScriptStore] Executing action: ${actionType}`);

    // Record action execution to AIAgentStore
    let actionId: string | null = null;
    try {
      const { useAIAgentStore } = await import('@Store/AIAgentStore');
      const viewMode = useNotebookStore.getState().viewMode;
      const currentCellId = useNotebookStore.getState().getCurrentCellId();

      // Format action content with parameters
      const actionContent = formatActionContent(actionType, step);

      // Add action to right sidebar
      useAIAgentStore.getState().addAction({
        type: 'system_event' as any,
        content: actionContent,
        result: '',
        relatedQAIds: [],
        cellId: currentCellId,
        viewMode: viewMode,
        onProcess: true,
      });

      // Get the action ID (the most recent action)
      const actions = useAIAgentStore.getState().actions;
      actionId = actions.length > 0 ? actions[0].id : null;
    } catch (error) {
      console.error('[ScriptStore] Failed to record action to sidebar:', error);
    }

    try {
      // Import action registry dynamically to avoid circular dependencies
      const { getActionClass } = await import('../actions');

      // Get action class from registry
      const ActionClass = getActionClass(actionType);

      if (!ActionClass) {
        console.warn(`[ScriptStore] Unknown action type: ${actionType}`);

        // Mark action as failed
        if (actionId) {
          const { useAIAgentStore } = await import('@Store/AIAgentStore');
          useAIAgentStore.getState().updateAction(actionId, {
            onProcess: false,
            result: `Unknown action type: ${actionType}`,
          });
        }
        return;
      }

      // Create action instance with scriptStore reference
      // @ts-expect-error ActionClass is a concrete class, not abstract
      const action = new ActionClass(get());

      // Execute action
      const result = await action.execute(step);

      // Update action with result
      if (actionId) {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        useAIAgentStore.getState().updateAction(actionId, {
          onProcess: false,
          result: formatActionResult(result),
        });
      }

      return result;
    } catch (error) {
      console.error(`[ScriptStore] Error executing action ${actionType}:`, error);

      // Mark action as failed
      if (actionId) {
        const { useAIAgentStore } = await import('@Store/AIAgentStore');
        useAIAgentStore.getState().updateAction(actionId, {
          onProcess: false,
          result: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      throw error;
    }
  },

  // ==============================================
  // Cell Operations
  // ==============================================
  addCell: (
    cellType: string,
    content: string,
    metadata: ActionMetadata = {},
    options: any = {}
  ): string | null => {
    try {
      const cellId = uuidv4();
      const mappedType = CELL_TYPE_MAPPING[cellType] || 'markdown';

      const cellData: any = {
        id: cellId,
        type: mappedType,
        content,
        outputs: [],
        enableEdit: mappedType !== 'thinking',
        metadata,
      };

      if (mappedType === 'code') {
        cellData.language = options.language || 'python';
      }

      if (mappedType === 'thinking') {
        cellData.agentName = options.agentName || 'AI';
        cellData.customText = options.customText || null;
        cellData.textArray = options.textArray || ['AI is thinking...'];
        cellData.useWorkflowThinking = options.useWorkflowThinking || false;
      }

      useNotebookStore.getState().addCell(cellData);
      set({ lastAddedActionId: cellId });

      console.log(`[ScriptStore] Added cell: ${cellType} (${cellId})`);
      return cellId;
    } catch (error) {
      console.error('[ScriptStore] Error adding cell:', error);
      return null;
    }
  },

  updateLastText: (text: string): void => {
    const { cells, updateCell } = useNotebookStore.getState();
    const lastCell = cells[cells.length - 1];
    if (lastCell?.type === 'markdown') {
      updateCell(lastCell.id, text);
    }
  },

  finishThinking: (): void => {
    const { cells, deleteCell } = useNotebookStore.getState();
    const lastThinkingCell = cells.filter((cell) => cell.type === 'thinking').pop();
    if (lastThinkingCell) {
      deleteCell(lastThinkingCell.id);
    }
  },

  setEffectAsThinking: (thinkingText = 'finished thinking'): void => {
    const { cells, updateCellMetadata } = useNotebookStore.getState();
    const lastCell = cells[cells.length - 1];
    if (lastCell?.type === 'code') {
      updateCellMetadata(lastCell.id, {
        ...lastCell.metadata,
        finished_thinking: true,
        thinkingText: thinkingText,
      });
    }
  },

  execCodeCell: async (codecellId: string, needOutput = true, autoDebug = false): Promise<any> => {
    if (!codecellId) return Promise.resolve(false);

    try {
      const { setCellMode, executeCell } = useCodeStore.getState();
      if (needOutput) setCellMode(codecellId, 'output_only');

      const result = await executeCell(codecellId);

      if (result?.success && result.outputs) {
        // Add outputs to effect context
        const outputs: any = result.outputs;
        const stateMachine = (
          await import('./workflowStateMachine')
        ).useWorkflowStateMachine.getState();
        const stateJSON = stateMachine.stateJSON;

        // Ensure effects.current exists
        if (!stateJSON.state.effects) {
          stateJSON.state.effects = { current: [], history: [] };
        }
        if (!stateJSON.state.effects.current) {
          stateJSON.state.effects.current = [];
        }

        if (Array.isArray(outputs)) {
          outputs.forEach((item: any) => {
            // Map ExecutionOutput to Effect
            const outputType = item.type || 'text';
            let effectType: 'text' | 'image_url' | 'error' = 'text';
            let effectContent = item.content || item.text || item.toString();

            if (outputType === 'image') {
              effectType = 'image_url';
              // If content is base64, we might need to handle it, but for now assume it's a URL or base64 string
            } else if (outputType === 'error') {
              effectType = 'error';
            }

            // Update AIPlanningContext (Legacy)
            useAIPlanningContextStore.getState().addEffect(effectContent);

            // Update WorkflowStateMachine (New Architecture)
            if (effectType === 'error') {
              stateJSON.state.effects.current.push({
                type: 'error',
                error: {
                  name: 'ExecutionError',
                  message: effectContent,
                  traceback: [],
                },
                cell_ref: codecellId,
              });
            } else if (effectType === 'image_url') {
              stateJSON.state.effects.current.push({
                type: 'image_url',
                image_url: effectContent,
                cell_ref: codecellId,
              });
            } else {
              stateJSON.state.effects.current.push({
                type: 'text',
                text: effectContent,
                cell_ref: codecellId,
              });
            }
          });
        } else {
          // Handle single output (legacy/fallback)
          const effectText = outputs.content || outputs.text || outputs.toString();
          useAIPlanningContextStore.getState().addEffect(effectText);

          stateJSON.state.effects.current.push({
            type: 'text',
            text: effectText,
            cell_ref: codecellId,
          });
        }

        // Sync state back to store
        stateMachine.setState(stateJSON);
        console.log(
          `[ScriptStore] Updated state.effects.current with execution results from ${codecellId}`
        );
      }

      if (autoDebug && !result?.success) {
        setTimeout(() => {
          useNotebookStore.getState().setCurrentCell(codecellId);
          sendCurrentCellExecuteCodeError_should_debug();
        }, 1000);
        return result.error;
      }

      return result.success ? result.outputs : result.error;
    } catch (error) {
      console.error(`[ScriptStore] Error executing cell ${codecellId}:`, error);
      return Promise.resolve(false);
    }
  },

  updateTitle: (title: string): void => {
    useNotebookStore.getState().updateTitle(title);
  },
}));

export default useScriptStore;
