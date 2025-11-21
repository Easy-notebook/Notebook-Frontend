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
import globalUpdateInterface from '@/interfaces/globalUpdateInterface';
import { useAIPlanningContextStore } from './aiPlanningContext';

// ==============================================
// Types
// ==============================================

export interface ActionMetadata {
  [key: string]: any;
  isStep?: boolean;
  isChapter?: boolean;
  isSection?: boolean;
  isComment?: boolean;
  finished_thinking?: boolean;
  thinkingText?: string;
}

export interface ExecutionStep {
  action: string;
  storeId?: string;
  content?: string;
  metadata?: ActionMetadata;

  // For specific action types
  agentName?: string;
  customText?: string | null;
  textArray?: string[];
  thinkingText?: string;
  text?: string;
  codecell_id?: string;
  need_output?: boolean;
  auto_debug?: boolean;
  title?: string;
  shotType?: string;
  level?: 'stages' | 'steps' | 'behaviors';
  focus?: string;
  outputs?: any;
  state?: any;
  language?: string;

  // Legacy support
  stepId?: string;
  phaseId?: string;
}

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

    try {
      // Import action registry dynamically to avoid circular dependencies
      const { getActionClass } = await import('../actions');

      // Get action class from registry
      const ActionClass = getActionClass(actionType);

      if (!ActionClass) {
        console.warn(`[ScriptStore] Unknown action type: ${actionType}`);
        return;
      }

      // Create action instance with scriptStore reference
      const action = new ActionClass(get());

      // Execute action
      const result = await action.execute(step);

      return result;
    } catch (error) {
      console.error(`[ScriptStore] Error executing action ${actionType}:`, error);
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
        if (Array.isArray(outputs)) {
          outputs.forEach((item: any) => {
            const effectText = item.content || item.text || item.toString();
            useAIPlanningContextStore.getState().addEffect(effectText);
          });
        } else {
          const effectText = outputs.content || outputs.text || outputs.toString();
          useAIPlanningContextStore.getState().addEffect(effectText);
        }
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
