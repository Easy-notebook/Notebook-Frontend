/**
 * AI Planning Context Store
 *
 * This module provides a global state management for AI planning features
 * using Zustand. It manages checklists, plans, effects, thinking logs,
 * stage status, variables, and to-do lists.
 *
 * @author Hu Silan
 * @project Easy-notebook
 * @file aiPlanningContext.ts
 */
import { create, StateCreator } from 'zustand';

// ## Type Definitions

// Defines the structure for a snapshot of the core AI context, used for backups.
interface AIContext {
  checklist: { current: string[]; completed: string[] };
  thinking: string[];
  variables: Record<string, unknown>;
  toDoList: string[];
  stageStatus: Record<string, boolean>;
  effect: { current: string[]; history: string[] };
}

// Defines the structure for tracking request contexts to prevent duplicate executions.
interface RequestContext {
  stepId: string;
  stageId: string;
  toDoList: string[];
  variables: Record<string, unknown>;
  thinkingLength: number;
}

// Defines the state structure of the store.
interface AIPlanningState extends AIContext {
  backup: {
    lastStage: Partial<AIContext>;
    lastStep: Partial<AIContext>;
    cache: Partial<AIContext>;
  };
  lastRequestContext: Record<string, RequestContext>;
}

// Defines the actions (methods) available in the store.
interface AIPlanningActions {
  // --- State Machine Integration & Checks ---
  isCurStepCompleted: () => boolean;
  canAutoAdvanceToNextStep: () => boolean;
  canAutoAdvanceToNextStage: (stageId: string) => boolean;
  isWorkflowUpdateConfirmed: () => boolean;
  notifyStepStarted: (stepId: string) => void;
  notifyStepCompleted: (stepId: string, result: unknown) => void;
  notifyStageCompleted: (stageId: string) => void;
  isStepReadyForCompletion: (stepId: string) => boolean;
  isStageReadyForCompletion: (stageId: string) => boolean;

  // --- Request Context Management ---
  isRequestContextSame: (stepId: string, stageId: string) => boolean;
  updateRequestContext: (stepId: string, stageId: string) => void;
  clearRequestContext: (stepId: string, stageId: string) => void;

  // --- State Manipulators ---
  setChecklist: (current: string[], completed: string[]) => void;
  addToDoList: (item: string) => void;
  addChecklistCurrentItem: (item: string) => void;
  newChecklistCurrentItem: (item: string) => void; // Alias for backward compatibility
  addChecklistCompletedItem: (item: string) => void;
  setThinking: (thinking: string[]) => void;
  addThinkingLog: (thought: string) => void;
  markStageAsComplete: (stageId: string) => void;
  isStageComplete: (stageId: string) => boolean;
  addVariable: (key: string, value: unknown) => void;
  updateVariable: (key: string, value: unknown) => void;
  getVariable: (key: string) => unknown;
  setVariables: (newVariables: Record<string, unknown>) => void;
  resetVariables: () => void;
  resetEffect: () => void;
  setEffect: (newEffect: { current: string[]; history: string[] }) => void;
  addEffect: (effect: string) => void;
  clearStageStatus: (stageId: string) => void;
  clearAllStageStatus: () => void;
  resetAIPlanningContext: () => void;

  // --- Context Management ---
  getContext: () => AIContext;
  setContext: (context: AIContext) => void;

  // --- Backup & Restore ---
  storeCurrentContext2BackupCache: () => void;
  storeCurrentContext2BackupLastStage: () => void;
  storeCurrentContext2BackupLastStep: () => void;
  loadBackupCache2Context: () => void;
  loadBackupLastStep2Context: () => void;
  loadBackupLastStage2Context: () => void;
}

// Combined type for the complete store
type AIPlanningStore = AIPlanningState & AIPlanningActions;

// ## Initial State

const initialState: AIPlanningState = {
  effect: { current: [], history: [] },
  stageStatus: {},
  thinking: [],
  variables: {},
  toDoList: [],
  checklist: { current: [], completed: [] },
  backup: { lastStage: {}, lastStep: {}, cache: {} },
  lastRequestContext: {},
};

// ## Store Implementation

const storeCreator: StateCreator<AIPlanningStore> = (set, get) => ({
  ...initialState,

  // --- State Machine Integration & Checks ---
  isCurStepCompleted: () => get().toDoList.length === 0,
  canAutoAdvanceToNextStep: () => get().toDoList.length === 0,
  canAutoAdvanceToNextStage: (stageId) => !!get().stageStatus[stageId],
  isWorkflowUpdateConfirmed: () => true, // Placeholder
  notifyStepStarted: (stepId) => {
    console.log('AI Planning: Step started:', stepId);
  },
  notifyStepCompleted: (stepId, result) => {
    console.log('AI Planning: Step completed:', stepId, 'Result:', result);
    if (get().toDoList.length === 0) {
      set((state) => ({
        checklist: {
          ...state.checklist,
          completed: [...state.checklist.completed, `step_${stepId}_completed`],
        },
      }));
    }
  },
  notifyStageCompleted: (stageId) => {
    console.log('AI Planning: Stage completed:', stageId);
    get().markStageAsComplete(stageId);
    set({
      toDoList: [],
      checklist: { current: [], completed: [] },
      thinking: [],
    });
  },
  isStepReadyForCompletion: () => {
    const { toDoList, checklist } = get();
    return toDoList.length === 0 && checklist.current.length === 0;
  },
  isStageReadyForCompletion: (stageId) => {
    const { stageStatus, toDoList } = get();
    return toDoList.length === 0 && !!stageStatus[stageId];
  },

  // --- Request Context Management ---
  isRequestContextSame: (stepId, stageId) => {
    const { lastRequestContext, toDoList, variables, thinking } = get();
    const currentContext: RequestContext = {
      stepId,
      stageId,
      toDoList: [...toDoList],
      variables: { ...variables },
      thinkingLength: thinking.length,
    };
    const contextKey = `${stageId}_${stepId}`;
    const lastContext = lastRequestContext[contextKey];
    if (!lastContext) return false;

    const isSame = JSON.stringify(currentContext) === JSON.stringify(lastContext);
    console.log('[AI Context] Request context comparison:', { isSame, stepId, stageId });
    return isSame;
  },
  updateRequestContext: (stepId, stageId) => {
    const { toDoList, variables, thinking } = get();
    const contextKey = `${stageId}_${stepId}`;
    const currentContext: RequestContext = {
      stepId,
      stageId,
      toDoList: [...toDoList],
      variables: { ...variables },
      thinkingLength: thinking.length,
    };
    set((state) => ({
      lastRequestContext: {
        ...state.lastRequestContext,
        [contextKey]: currentContext,
      },
    }));
    console.log('[AI Context] Updated request context for:', contextKey);
  },
  clearRequestContext: (stepId, stageId) => {
    const contextKey = `${stageId}_${stepId}`;
    set((state) => {
      const newContext = { ...state.lastRequestContext };
      delete newContext[contextKey];
      return { lastRequestContext: newContext };
    });
    console.log('[AI Context] Cleared request context for:', contextKey);
  },

  // --- State Manipulators ---
  setChecklist: (current, completed) => set({ checklist: { current, completed } }),
  addToDoList: (item) => set((state) => ({ toDoList: [...state.toDoList, item] })),
  addChecklistCurrentItem: (item) => {
    set((state) =>
      state.checklist.current.includes(item)
        ? {}
        : {
            checklist: {
              ...state.checklist,
              current: [...state.checklist.current, item],
            },
          }
    );
  },
  newChecklistCurrentItem: (item) => get().addChecklistCurrentItem(item),
  addChecklistCompletedItem: (item) => {
    set((state) => {
      if (!state.checklist.current.includes(item)) return {};
      return {
        checklist: {
          current: state.checklist.current.filter((i) => i !== item),
          completed: state.checklist.completed.includes(item)
            ? state.checklist.completed
            : [...state.checklist.completed, item],
        },
      };
    });
  },
  setThinking: (thinking) => set({ thinking: thinking || [] }),
  addThinkingLog: (thought) => set((state) => ({ thinking: [...state.thinking, thought] })),
  markStageAsComplete: (stageId) =>
    set((state) => ({ stageStatus: { ...state.stageStatus, [stageId]: true } })),
  isStageComplete: (stageId) => !!get().stageStatus[stageId],
  addVariable: (key, value) =>
    set((state) => ({ variables: { ...state.variables, [key]: value } })),
  updateVariable: (key, value) =>
    set((state) => ({ variables: { ...state.variables, [key]: value } })),
  getVariable: (key) => get().variables[key],
  setVariables: (newVariables) => set({ variables: newVariables }),
  resetVariables: () => set({ variables: {} }),
  resetEffect: () => set({ effect: { current: [], history: [] } }),
  setEffect: (newEffect) => set({ effect: newEffect }),
  addEffect: (newEffectItem) => {
    console.log(`[aiPlanningContext] Adding effect item:`, newEffectItem);
    set((state) => {
      const newEffect = {
        ...state.effect,
        current: [...state.effect.current, newEffectItem],
      };
      console.log(`[aiPlanningContext] Updated effect state:`, newEffect);
      return { effect: newEffect };
    });
  },
  clearStageStatus: (stageId) =>
    set((state) => ({ stageStatus: { ...state.stageStatus, [stageId]: false } })),
  clearAllStageStatus: () => set({ stageStatus: {} }),
  resetAIPlanningContext: () => {
    const { backup, lastRequestContext } = get();
    set({ ...initialState, backup, lastRequestContext });
  },

  // --- Context Management ---
  getContext: () => {
    const { checklist, thinking, variables, toDoList, stageStatus, effect } = get();
    return { checklist, thinking, variables, toDoList, stageStatus, effect };
  },
  setContext: (context) => set(context),
  
  // --- Backup & Restore ---
  storeCurrentContext2BackupCache: () =>
    set((state) => ({ backup: { ...state.backup, cache: get().getContext() } })),
  storeCurrentContext2BackupLastStage: () =>
    set((state) => ({ backup: { ...state.backup, lastStage: get().getContext() } })),
  storeCurrentContext2BackupLastStep: () =>
    set((state) => ({ backup: { ...state.backup, lastStep: get().getContext() } })),
  loadBackupCache2Context: () => set((state) => ({ ...state.backup.cache })),
  loadBackupLastStep2Context: () => set((state) => ({ ...state.backup.lastStep })),
  loadBackupLastStage2Context: () => set((state) => ({ ...state.backup.lastStage })),
});

export const useAIPlanningContextStore = create<AIPlanningStore>(storeCreator);