import { create } from 'zustand';

/**
 * @interface WorkflowPanelState
 * @description Manages state specific to the workflow UI panel, primarily for user interaction dialogs.
 */
interface WorkflowPanelState {
  // State for the "Workflow Update Confirmation" dialog
  showWorkflowConfirm: boolean;
  pendingWorkflowUpdate: any | null; // Stores the data for the pending update
  
  // Handlers to connect the dialog's buttons to the state machine's logic
  onConfirmWorkflowUpdate: (() => void) | null;
  onRejectWorkflowUpdate: (() => void) | null;

  // Local UI settings
  isAutoTracking: boolean;

  // Actions
  setShowWorkflowConfirm: (show: boolean) => void;
  setPendingWorkflowUpdate: (update: any | null) => void;
  setOnConfirmWorkflowUpdate: (handler: (() => void) | null) => void;
  setOnRejectWorkflowUpdate: (handler: (() => void) | null) => void;
  
  toggleAutoTracking: () => void;
  
  // Utility methods for UI components to call
  confirmWorkflowUpdate: () => void;
  rejectWorkflowUpdate: () => void;

  // Reset function
  reset: () => void;
}

/**
 * The initial state for the store.
 */
const initialState = {
  showWorkflowConfirm: false,
  pendingWorkflowUpdate: null,
  onConfirmWorkflowUpdate: null,
  onRejectWorkflowUpdate: null,
  isAutoTracking: true, // Default to auto-tracking the current step
};

/**
 * @name useWorkflowPanelStore
 * @description
 * A Zustand store for managing the state of the UI workflow panel.
 * Its primary responsibility is to handle user interactions like confirmation dialogs
 * for major workflow updates, decoupling the UI from the core state machine logic.
 */
export const useWorkflowPanelStore = create<WorkflowPanelState>((set, get) => ({
  ...initialState,

  // --- Actions to control the confirmation dialog ---

  setShowWorkflowConfirm: (show) => set({ showWorkflowConfirm: show }),
  setPendingWorkflowUpdate: (update) => set({ pendingWorkflowUpdate: update }),
  setOnConfirmWorkflowUpdate: (handler) => set({ onConfirmWorkflowUpdate: handler }),
  setOnRejectWorkflowUpdate: (handler) => set({ onRejectWorkflowUpdate: handler }),

  // --- Actions for local UI settings ---

  toggleAutoTracking: () => set((state) => ({ isAutoTracking: !state.isAutoTracking })),

  // --- Utility methods for UI components ---
  // These methods are called by UI buttons (e.g., onClick) and delegate to the currently set handlers.

  /**
   * Executes the confirmation callback.
   */
  confirmWorkflowUpdate: () => {
    get().onConfirmWorkflowUpdate?.();
  },

  /**
   * Executes the rejection callback.
   */
  rejectWorkflowUpdate: () => {
    get().onRejectWorkflowUpdate?.();
  },

  /**
   * Resets the store to its initial state.
   */
  reset: () => set(initialState),
}));