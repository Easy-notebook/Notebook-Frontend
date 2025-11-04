import { create } from 'zustand';

interface WorkflowControlState {
  // State
  isGenerating: boolean;
  isCompleted: boolean;
  continueCountdown: number;
  isReturnVisit: boolean;
  continueButtonText: string;
  
  // Dynamic Workflow State
  dynamicWorkflow: any | null;
  workflowAnalysis: any | null;
  selectedChapters: string[];
  currentChapterActions: any | null;
  
  // Actions
  setIsGenerating: (isGenerating: boolean) => void;
  setIsCompleted: (isCompleted: boolean) => void;
  setContinueCountdown: (countdown: number) => void;
  setIsReturnVisit: (isReturnVisit: boolean) => void;
  setContinueButtonText: (text: string) => void;
  
  // Dynamic Workflow Actions
  setDynamicWorkflow: (workflow: any) => void;
  setWorkflowAnalysis: (analysis: any) => void;  
  setSelectedChapters: (chapters: string[]) => void;
  setCurrentChapterActions: (actions: any) => void;
  
  // Event handlers
  onTerminate: (() => void) | null;
  onContinue: (() => void) | null;
  onCancelCountdown: (() => void) | null;
  
  setOnTerminate: (handler: (() => void) | null) => void;
  setOnContinue: (handler: (() => void) | null) => void;
  setOnCancelCountdown: (handler: (() => void) | null) => void;
  
  // Reset function
  reset: () => void;
  hardReset: () => void;
}

const initialState = {
  isGenerating: false,
  isCompleted: false,
  continueCountdown: 0,
  isReturnVisit: false,
  continueButtonText: 'Continue to Next Stage',
  
  // Dynamic Workflow Initial State
  dynamicWorkflow: null,
  workflowAnalysis: null,
  selectedChapters: [],
  currentChapterActions: null,
  
  onTerminate: null,
  onContinue: null,
  onCancelCountdown: null,
};

export const useWorkflowControlStore = create<WorkflowControlState>((set) => ({
  ...initialState,
  
  // State setters - simplified without get() calls
  setIsGenerating: (isGenerating) => set((state) => {
    if (state.isGenerating !== isGenerating) {
      return { isGenerating };
    }
    return state;
  }),
  setIsCompleted: (isCompleted) => set((state) => {
    if (state.isCompleted !== isCompleted) {
      return { isCompleted };
    }
    return state;
  }),
  setContinueCountdown: (continueCountdown) => set((state) => {
    if (state.continueCountdown !== continueCountdown) {
      return { continueCountdown };
    }
    return state;
  }),
  setIsReturnVisit: (isReturnVisit) => set((state) => {
    if (state.isReturnVisit !== isReturnVisit) {
      return { isReturnVisit };
    }
    return state;
  }),
  setContinueButtonText: (continueButtonText) => set((state) => {
    if (state.continueButtonText !== continueButtonText) {
      return { continueButtonText };
    }
    return state;
  }),
  
  // Dynamic Workflow setters
  setDynamicWorkflow: (dynamicWorkflow) => set((state) => {
    if (state.dynamicWorkflow !== dynamicWorkflow) {
      console.log('setDynamicWorkflow called:', dynamicWorkflow);
      return { dynamicWorkflow };
    }
    return state;
  }),
  setWorkflowAnalysis: (workflowAnalysis) => set((state) => {
    if (state.workflowAnalysis !== workflowAnalysis) {
      console.log('setWorkflowAnalysis called:', workflowAnalysis);
      return { workflowAnalysis };
    }
    return state;
  }),
  setSelectedChapters: (selectedChapters) => set((state) => {
    if (JSON.stringify(state.selectedChapters) !== JSON.stringify(selectedChapters)) {
      console.log('setSelectedChapters called:', selectedChapters);
      return { selectedChapters };
    }
    return state;
  }),
  setCurrentChapterActions: (currentChapterActions) => set((state) => {
    if (state.currentChapterActions !== currentChapterActions) {
      console.log('setCurrentChapterActions called:', currentChapterActions);
      return { currentChapterActions };
    }
    return state;
  }),
  
  // Event handler setters - only update if different
  setOnTerminate: (onTerminate) => set((state) => {
    if (state.onTerminate !== onTerminate) {
      console.log('setOnTerminate called:', !!onTerminate);
      return { onTerminate };
    }
    return state;
  }),
  setOnContinue: (onContinue) => set((state) => {
    if (state.onContinue !== onContinue) {
      console.log('setOnContinue called:', !!onContinue);
      return { onContinue };
    }
    return state;
  }),
  setOnCancelCountdown: (onCancelCountdown) => set((state) => {
    if (state.onCancelCountdown !== onCancelCountdown) {
      console.log('setOnCancelCountdown called:', !!onCancelCountdown);
      return { onCancelCountdown };
    }
    return state;
  }),
  
  // Reset function - simplified
  reset: () => set(initialState),
  
  // Hard reset - completely reset everything  
  hardReset: () => set(initialState),
}));