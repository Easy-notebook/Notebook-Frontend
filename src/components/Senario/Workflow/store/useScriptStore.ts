// ==============================================
// VDS Script Store - TypeScript Enhanced Version
// ==============================================
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// External dependencies
import useNotebookStore from '../../../../store/notebookStore';
import { sendCurrentCellExecuteCodeError_should_debug } from '../../../../store/autoActions';
import useCodeStore from '../../../../store/codeStore';
import globalUpdateInterface from '../../../../interfaces/globalUpdateInterface';

// --- NEW/UPDATED IMPORTS ---
// Import the new FSM and its events for dispatching actions
import { useWorkflowStateMachine, EVENTS } from './workflowStateMachine';
// Import the pipeline store to update the workflow structure
import { usePipelineStore } from './usePipelineStore'; // Assumes usePipelineStore.ts exists in the same directory
// Import the AI context store
import { useAIPlanningContextStore } from './aiPlanningContext';
import { Newspaper } from 'lucide-react';
// ==============================================
// Types and Interfaces (Updated)
// ==============================================

export interface ActionMetadata {
    [key: string]: any;
    isStep?: boolean;
    isChapter?: boolean;
    isSection?: boolean;
    chapterId?: string;
    sectionId?: string;
    chapterNumber?: number;
    sectionNumber?: number;
    finished_thinking?: boolean;
    thinkingText?: string;
}

export interface ScriptAction {
    id: string;
    type: string;
    content: string;
    metadata: ActionMetadata;
    description?: string;
    // 'mode' is deprecated, managed by FSM
    isModified?: boolean;
    timestamp?: string;
    // Maps to the FSM's currentStepId
    stepId: string | null;
    couldVisibleInWritingMode?: boolean;
    // Thinking cell specific properties
    agentName?: string;
    customText?: string | null;
    textArray?: string[];
    useWorkflowThinking?: boolean;
    // Code cell specific properties
    language?: string;
}

// ScriptStep now only tracks action IDs for grouping, completion status is in FSM
export interface ScriptStep {
    actionIds: string[];
    isModified?: boolean;
}

export interface ExecutionStep {
    action: string;
    storeId?: string;
    contentType?: string;
    content?: string;
    metadata?: ActionMetadata;
    agentName?: string;
    customText?: string | null;
    textArray?: string[];
    thinkingText?: string;
    text?: string;
    actionIdRef?: string;
    stepId?: string; // Corresponds to FSM's stepId
    phaseId?: string; // Legacy support, maps to stepId
    keepDebugButtonVisible?: boolean;
    codecell_id?: string;
    need_output?: boolean;
    auto_debug?: boolean;
    title?: string;
    // New payload structures for FSM
    updated_workflow?: { workflowTemplate: any; nextStageId?: string }; // Matches PendingUpdateData
    updated_steps?: any[];
    stage_id?: string;
    shotType?: string; // Backend-provided shotType: 'action'=code, 'dialogue'=text
}

export interface ScriptStoreState {
    // UI State
    debugButtonVisible: boolean;
    onSequenceComplete: (() => void) | null;
    onSequenceTerminate: (() => void) | null;
    lastAddedActionId: string | null;

    // Script Management
    actions: ScriptAction[];
    steps: Record<string, ScriptStep>; // Keyed by FSM's stepId

    // Counters (optional, might be deprecated)
    chapterCounter: number;
    sectionCounter: number;
}

export interface ScriptStoreActions {
    // Helper functions
    getDefaultContent: (contentType?: string) => string;
    getCurrentStepId: () => string | null;
    getCurrentStepActions: () => ScriptAction[];

    // Action Management
    createNewAction: (type?: string, content?: string, metadata?: ActionMetadata) => string | null;
    addMultipleActions: (actions: Partial<ScriptAction>[]) => string[];
    addAction: (action: Partial<ScriptAction>, couldVisibleInWritingMode?: boolean) => string | null;
    updateAction: (actionId: string, updates?: Partial<ScriptAction>) => boolean;
    removeAction: (actionId: string) => boolean;

    // Specialized Operations
    updateLastText: (text: string) => void;
    finishThinking: () => void;
    setEffectAsThinking: (thinkingText?: string) => void;

    // Code Execution
    execCodeCell: (codecell_id: string, need_output?: boolean, auto_debug?: boolean) => Promise<any>;
    updateTitle: (title: string) => void;

    // Main Execution Engine
    execAction: (step: ExecutionStep) => Promise<any>;
}

export type ScriptStore = ScriptStoreState & ScriptStoreActions;

// ==============================================
// Constants
// ==============================================

const CELL_TYPE_MAPPING: Record<string, string> = {
    text: 'markdown',
    code: 'code',
    Hybrid: 'Hybrid',
    outcome: 'outcome',
    error: 'error',
    thinking: 'thinking'
};

// Renamed and streamlined action types
const ACTION_TYPES = {
    ADD_ACTION: 'add', // Generic add, use shotType to determine cell type
    IS_THINKING: 'is_thinking',
    FINISH_THINKING: 'finish_thinking',
    EXEC_CODE: 'exec', // Renamed for clarity
    UPDATE_TITLE: 'update_title',
    UPDATE_WORKFLOW: 'update_workflow', // Triggers FSM update flow
    UPDATE_STEP_LIST: 'update_stage_steps', // Renamed for clarity, updates pipeline
    COMPLETE_STEP: 'end_phase', // Legacy 'end_phase' now maps to COMPLETE_STEP event
    NEXT_EVENT: 'next_event', // Next event
    NEW_CHAPTER: 'new_chapter', // New chapter
    NEW_SECTION: 'new_section', // New section
};

// ==============================================
// Utility Functions
// ==============================================

const formatActionContent = (content: string, isStep = false): string => {
    if (!content) return '';
    if (isStep) {
        return content.startsWith('#') ? content : `### ${content}`;
    }
    return content;
};

const getDefaultContentByType = (contentType = 'text'): string => {
    const defaults: Record<string, string> = {
        text: '',
        code: '# Write your code here',
        outcome: 'Results will be displayed here',
        error: 'Error occurred',
        thinking: 'AI is thinking...'
    };
    return defaults[contentType] || '';
};

const createCellData = (actionId: string, action: Partial<ScriptAction>, cellType: string, content: string, currentStepId: string | null) => {
    const baseCell: any = {
        id: actionId,
        type: cellType,
        content: content,
        outputs: [],
        enableEdit: cellType !== 'thinking',
        phaseId: currentStepId, // Link cell to the FSM step
        description: action.description || '',
        metadata: action.metadata || {}
    };

    if (cellType === 'code' || cellType === 'Hybrid') {
        baseCell.language = action.language || 'python';
    }

    if (cellType === 'thinking') {
        baseCell.agentName = action.agentName || 'AI';
        baseCell.customText = action.customText || null;
        baseCell.textArray = action.textArray || [`${action.agentName || 'AI'} is thinking...`];
        baseCell.useWorkflowThinking = action.useWorkflowThinking || false;
    }

    return baseCell;
};

// ==============================================
// Store Implementation
// ==============================================

export const useScriptStore = create<ScriptStore>((set, get) => ({
    // ==============================================
    // State
    // ==============================================
    debugButtonVisible: true,
    onSequenceComplete: null,
    onSequenceTerminate: null,
    lastAddedActionId: null,
    actions: [],
    steps: {},
    chapterCounter: 0,
    sectionCounter: 0,

    // ==============================================
    // Helper Functions (Updated)
    // ==============================================
    getDefaultContent: getDefaultContentByType,

    // Gets current step ID from the FSM
    getCurrentStepId: (): string | null => {
        return useWorkflowStateMachine.getState().context.currentStepId;
    },

    // Gets actions for the current FSM step
    getCurrentStepActions: (): ScriptAction[] => {
        const currentStepId = get().getCurrentStepId();
        const { steps, actions } = get();
        if (!currentStepId) return [];
        const actionIds = steps[currentStepId]?.actionIds || [];
        return actions.filter(action => actionIds.includes(action.id));
    },

    // ==============================================
    // Action Management (Updated)
    // ==============================================
    createNewAction: (type = 'text', content = '', metadata = {}): string | null => {
        const actionId = uuidv4();
        const actionContent = content || get().getDefaultContent(type);
        const newAction: Partial<ScriptAction> = {
            id: actionId,
            type: type,
            content: actionContent,
            metadata: metadata
        };
        return get().addAction(newAction);
    },

    addMultipleActions: (actions = []): string[] => {
        if (!Array.isArray(actions) || actions.length === 0) return [];
        const addedActionIds: string[] = [];
        actions.forEach(action => {
            const actionId = get().addAction(action);
            if (actionId) addedActionIds.push(actionId);
        });
        return addedActionIds;
    },

    // Simplified: No longer checks for 'deduction mode'
    addAction: (action: Partial<ScriptAction>, couldVisibleInWritingMode = true): string | null => {
        const currentStepId = get().getCurrentStepId();

        try {
            const actionId = action.id || uuidv4();
            let content = action.content || get().getDefaultContent(action.type);
            if (action.type === 'text') {
                content = formatActionContent(content, action.metadata?.isStep);
            }

            const cellType = CELL_TYPE_MAPPING[action.type || 'text'] || 'markdown';
            const newAction: ScriptAction = {
                id: actionId,
                type: action.type || 'text',
                content,
                metadata: action.metadata || {},
                isModified: false,
                timestamp: new Date().toISOString(),
                stepId: currentStepId, // Link action to FSM step
                couldVisibleInWritingMode,
                ...(action.agentName && { agentName: action.agentName }),
                ...(action.customText !== undefined && { customText: action.customText }),
                ...(action.textArray && { textArray: action.textArray }),
                ...(action.useWorkflowThinking !== undefined && { useWorkflowThinking: action.useWorkflowThinking }),
                ...(action.language && { language: action.language })
            };

            const cellData = createCellData(actionId, action, cellType, content, currentStepId);
            cellData.couldVisibleInWritingMode = couldVisibleInWritingMode;

            useNotebookStore.getState().addCell(cellData);

            set(state => {
                const updatedStepActionIds = [...(state.steps[currentStepId || '']?.actionIds || []), actionId];
                return {
                    actions: [...state.actions, newAction],
                    steps: {
                        ...state.steps,
                        ...(currentStepId && {
                            [currentStepId]: { ...state.steps[currentStepId], actionIds: updatedStepActionIds, isModified: true }
                        })
                    },
                    lastAddedActionId: actionId
                };
            });
            return actionId;
        } catch (error) {
            console.error('[useScriptStore] Error adding action:', error);
            return null;
        }
    },

    updateAction: (actionId: string, updates: Partial<ScriptAction> = {}): boolean => {
        try {
            const notebookCell = useNotebookStore.getState().cells.find(cell => cell.id === actionId);
            if (!notebookCell) return false;

            if (updates.content !== undefined) {
                useNotebookStore.getState().updateCell(actionId, updates.content);
            }
            if (updates.metadata) {
                useNotebookStore.getState().updateCellMetadata(actionId, { ...notebookCell.metadata, ...updates.metadata });
            }

            set(state => {
                const actionIndex = state.actions.findIndex(action => action.id === actionId);
                if (actionIndex === -1) return state;

                const updatedActions = [...state.actions];
                updatedActions[actionIndex] = { ...updatedActions[actionIndex], ...updates, isModified: true };
                return { actions: updatedActions };
            });
            return true;
        } catch (error) {
            console.error('[useScriptStore] Error updating action:', error);
            return false;
        }
    },

    removeAction: (actionId: string): boolean => {
        const currentStepId = get().getCurrentStepId();
        if (!actionId || !currentStepId) return false;
        
        try {
            useNotebookStore.getState().deleteCell(actionId);
            set(state => ({
                actions: state.actions.filter(action => action.id !== actionId),
                steps: {
                    ...state.steps,
                    [currentStepId]: {
                        ...state.steps[currentStepId],
                        actionIds: state.steps[currentStepId].actionIds.filter(id => id !== actionId),
                        isModified: true
                    }
                }
            }));
            return true;
        } catch (error) {
            console.error('[useScriptStore] Error removing action:', error);
            return false;
        }
    },

    // ==============================================
    // Specialized Operations
    // ==============================================
    updateLastText: (text: string): void => {
        const { cells, updateCell } = useNotebookStore.getState();
        const lastCell = cells[cells.length - 1];
        if (lastCell?.type === 'markdown') {
            updateCell(lastCell.id, text);
        }
    },

    finishThinking: (): void => {
        const { cells, deleteCell } = useNotebookStore.getState();
        const lastThinkingCell = cells.filter(cell => cell.type === 'thinking').pop();
        if (!lastThinkingCell) return;
        deleteCell(lastThinkingCell.id);
        // Also remove from internal actions state
        set(state => ({ actions: state.actions.filter(action => action.id !== lastThinkingCell.id) }));
    },

    setEffectAsThinking: (thinkingText = "finished thinking"): void => {
        const { cells, updateCellMetadata } = useNotebookStore.getState();
        const lastCell = cells[cells.length - 1];
        if (lastCell.type !== 'code') {
            console.warn('last cell is not code type, but', lastCell.type);
            return;
        }
        // update last code cell's metadata, add finished_thinking mark
        updateCellMetadata(lastCell.id, {
            ...lastCell.metadata,
            finished_thinking: true,
            thinkingText: thinkingText
        });
        // ensure step's shot's metadata is also updated
        set(state => {
            const updatedActions = state.actions.map(shot => {
                if (shot.id === lastCell.id) {
                    return { ...shot, metadata: { ...shot.metadata, finished_thinking: true, thinkingText: thinkingText } };
                }
                return shot;
            });
            return {
                actions: updatedActions
            };
        });
    },

    // ==============================================
    // Code Execution
    // ==============================================
    execCodeCell: async (codecell_id: string, need_output = true, auto_debug = false): Promise<any> => {
        if (!codecell_id) return Promise.resolve(false);
        try {
            const { setCellMode, executeCell } = useCodeStore.getState();
            if (need_output) setCellMode(codecell_id, 'output_only');
            const result = await executeCell(codecell_id);
            if (result?.success && result.outputs) {
                // Convert outputs to effect format and add to context
                console.log('[useScriptStore] Raw execution result.outputs:', result.outputs);
                if (Array.isArray(result.outputs)) {
                    // For array outputs, each item should be added as a separate effect
                    result.outputs.forEach((item: any) => {
                        const effectText = item.content || item.text || item.toString();
                        console.log('[useScriptStore] Adding effect item:', effectText);
                        useAIPlanningContextStore.getState().addEffect(effectText);
                    });
                } else {
                    const effectText = result.outputs.content || result.outputs.text || result.outputs.toString();
                    console.log('[useScriptStore] Adding single effect:', effectText);
                    useAIPlanningContextStore.getState().addEffect(effectText);
                }
            }
            if (auto_debug && !result?.success) {
                setTimeout(() => {
                    useNotebookStore.getState().setCurrentCell(codecell_id);
                    sendCurrentCellExecuteCodeError_should_debug();
                }, 1000);
                return result.error;
            }
            return result.success ? result.outputs : result.error;
        } catch (error) {
            console.error(`[useScriptStore] Error executing cell ${codecell_id}:`, error);
            return Promise.resolve(false);
        }
    },

    updateTitle: (title: string): void => {
        useNotebookStore.getState().updateTitle(title);
    },

    // ==============================================
    // Main Execution Engine (INTEGRATED WITH FSM)
    // ==============================================
    execAction: async (step: ExecutionStep): Promise<any> => {
        if (!step?.action) {
            console.error('[useScriptStore] execAction requires step with action property');
            return;
        }

        const { transition } = useWorkflowStateMachine.getState();
        const actionType = step.action;
        
        // Helper function to sync state if present in action
        const syncStateIfPresent = () => {
            if (step.state) {
                console.log(`[useScriptStore] Syncing state from action '${actionType}':`, step.state);
                const { setContext, getContext } = useAIPlanningContextStore.getState();
                
                // Preserve current effect state when syncing
                const currentContext = getContext();
                const mergedState = {
                    ...step.state,
                    effect: currentContext.effect // Keep current effect state
                };
                
                console.log(`[useScriptStore] Merged state (preserving effect):`, mergedState);
                setContext(mergedState);
                console.log(`[useScriptStore] State sync completed for action '${actionType}'`);
            } else {
                console.log(`[useScriptStore] No state to sync for action '${actionType}'`);
            }
        };

        // Helper function to ensure current context is synced back to workflow state machine
        const syncCurrentStateToWorkflow = () => {
            const currentContext = useAIPlanningContextStore.getState().getContext();
            console.log(`[useScriptStore] Current effect state:`, currentContext.effect);
            console.log(`[useScriptStore] Syncing current context back to workflow:`, currentContext);
            // Update the workflow state machine's context with current state
            const { updateRequestContext } = useAIPlanningContextStore.getState();
            const currentStepId = get().getCurrentStepId();
            if (currentStepId) {
                updateRequestContext(currentStepId, currentStepId);
            }
        };

        try {
            switch (actionType) {
                case ACTION_TYPES.ADD_ACTION: {
                    const actionId = step.storeId || uuidv4();
                    // Determine cell type from backend's 'shotType'
                    const cellType = step.shotType === 'action' ? 'code' : 'text';
                    get().addAction({ id: actionId, type: cellType, content: step.content || '', metadata: step.metadata || {} });
                    syncStateIfPresent();
                    break;
                }
                case ACTION_TYPES.NEW_CHAPTER: {
                    const actionId = step.storeId || uuidv4();
                    const cellType = 'text';
                    get().addAction({ id: actionId, type: cellType, content: `## ${step.content}`, metadata: step.metadata || {} });
                    syncStateIfPresent();
                    break;
                }
                case ACTION_TYPES.NEW_SECTION: {
                    const actionId = step.storeId || uuidv4();
                    const cellType = 'text';
                    get().addAction({ id: actionId, type: cellType, content: `### ${step.content}`, metadata: step.metadata || {} });
                    syncStateIfPresent();
                    break;
                }
                case ACTION_TYPES.NEXT_EVENT: {
                    break;
                }
                case ACTION_TYPES.IS_THINKING: {
                    get().addAction({ type: 'thinking', textArray: step.textArray, agentName: step.agentName, customText: step.customText });
                    syncStateIfPresent();
                    break;
                }
                case ACTION_TYPES.FINISH_THINKING: {
                    get().finishThinking();
                    syncStateIfPresent();
                    break;
                }
                case ACTION_TYPES.EXEC_CODE: {
                    const targetId = step.codecell_id === "lastAddedCellId" ? get().lastAddedActionId : step.codecell_id;
                    if (targetId) {
                        console.log(`Executing code: ${targetId}`);
                        globalUpdateInterface.createAIRunningCode(`Executing...`, '', [], targetId, true);
                        const result = await get().execCodeCell(targetId, step.need_output, step.auto_debug);
                        console.log(`Execution completed: ${targetId}`, result);
                        globalUpdateInterface.createAIRunningCode(`Execution completed`, "", [], targetId, false);
                        syncStateIfPresent();
                        // Ensure the effect state is synced back to the workflow
                        syncCurrentStateToWorkflow();
                        return result;
                    } else {
                        console.warn('Failed to execute code: Cell ID not found');
                        globalUpdateInterface.createSystemEvent('Execution failed: Cell ID not found', '', [], null);
                    }
                    syncStateIfPresent();
                    break;
                }
                case 'set_effect_as_thinking': {
                    get().setEffectAsThinking(step.thinkingText);
                    syncStateIfPresent();
                    break;
                }
                case 'update_last_text': {
                    get().updateLastText(step.text);
                    syncStateIfPresent();
                    break;
                }
                case ACTION_TYPES.UPDATE_TITLE: {
                    if (step.title) get().updateTitle(step.title);
                    syncStateIfPresent();
                    break;
                }
                case ACTION_TYPES.COMPLETE_STEP: {
                    // Dispatch event to the FSM to complete the current step
                    console.log(`[useScriptStore] Received command to complete step. Transitioning with ${EVENTS.COMPLETE_STEP}.`);
                    transition(EVENTS.COMPLETE_STEP);
                    syncStateIfPresent();
                    break;
                }
                case ACTION_TYPES.UPDATE_WORKFLOW: {
                    // Check for workflow data in different possible locations
                    let workflowData = null;
                    if (step.updated_workflow?.workflowTemplate) {
                        workflowData = step.updated_workflow;
                    } else if (step.updated_workflow && typeof step.updated_workflow === 'object') {
                        workflowData = { workflowTemplate: step.updated_workflow };
                    }
                    
                    if (!workflowData || !workflowData.workflowTemplate) {
                        console.error('[useScriptStore] UPDATE_WORKFLOW action received without valid workflow data:', {
                            step,
                            updated_workflow: step.updated_workflow,
                            workflowData
                        });
                        transition(EVENTS.FAIL, { error: 'Invalid workflow update payload' });
                        syncStateIfPresent();
                        return;
                    }

                    // Trigger state machine to handle workflow update (this will pause execution)
                    console.log('[useScriptStore] Triggering workflow update via state machine');
                    transition(EVENTS.UPDATE_WORKFLOW, workflowData);
                    globalUpdateInterface.createSystemEvent('Workflow update received, awaiting user confirmation.', '', []);
                    syncStateIfPresent();
                    return;
                }
                case ACTION_TYPES.UPDATE_STEP_LIST: {
                    // This is a direct, non-confirmed update to the workflow structure
                    if (step.updated_steps && step.stage_id) {
                        console.log(`[useScriptStore] Updating steps for stage: ${step.stage_id}`);
                        // Directly call the pipeline store to update its data
                        usePipelineStore.getState().updateStepsForStage(step.stage_id, step.updated_steps);
                        globalUpdateInterface.createSystemEvent(`Workflow stage '${step.stage_id}' has been updated.`, '', []);
                    } else {
                         console.error('[useScriptStore] UPDATE_STEP_LIST action is missing stage_id or updated_steps.');
                    }
                    syncStateIfPresent();
                    break;
                }
                default:
                    console.warn(`[useScriptStore] Unknown or unhandled action type: ${actionType}`);
            }
        } catch (error) {
            console.error(`[useScriptStore] Error executing action ${actionType}:`, error);
            // Dispatch a FAIL event to the FSM on error
            transition(EVENTS.FAIL, { error: error.message, action: actionType });
            throw error;
        }
    }
}));

export default useScriptStore;