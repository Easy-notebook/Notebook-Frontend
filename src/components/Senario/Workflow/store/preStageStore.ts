import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { analyzeDatasetStructure } from '../utils/dataAnalysis'; // Assumes this utility exists and is typed

/**
 * @description Defines the shape of the data returned by the analysis function.
 * This should ideally be defined in the dataAnalysis utility file and imported.
 */
interface AnalysisResult {
  columns: string[];
  metadata: string;
}

/**
 * @description Interface for the store's state properties.
 */
interface PreStageState {
  currentFile: File | null;
  isUploading: boolean;
  csv_file_path: string;
  problem_description: string;
  context_description: string;
  choiceMap: any[]; // For better type safety, replace 'any' with a specific interface if possible
  file_columns: string[];
  selectedProblemType: string | null;
  selectedTarget: string | null;
  datasetInfo: string;
  dataBackground: string;
  problem_name: string;
}

/**
 * @description Interface for the store's actions (functions).
 * Getters are often not needed in Zustand as state can be selected directly from the hook,
 * but they are included here to match the original JavaScript implementation.
 */
interface PreStageActions {
  // Getters
  getDataBackground: () => string;
  getCurrentFile: () => File | null;
  getIsUploading: () => boolean;
  getFileColumns: () => string[];
  getDatasetInfo: () => string;
  getCurrentChoiceMap: () => any[];
  getProblemName: () => string;

  // Setters and other actions
  setCurrentFile: (file: File | null) => Promise<void>;
  setFileColumns: (columns: string[]) => void;
  setDataBackground: (background: string) => void;
  setDatasetInfo: (info: string) => void;
  setIsUploading: (value: boolean) => void;
  changeIsUploading: () => void;
  setCsvFilePath: (path: string) => void;
  setProblemName: (name: string) => void;
  setProblemDescription: (desc: string) => void;
  setContextDescription: (desc: string) => void;
  setSelectedProblem: (target: string, description: string, problemName: string) => void;
  updateChoiceMap: (choiceMap: any[]) => void;
  resetStore: () => void;
}

/**
 * @description Combined store type including both state and actions.
 */
type PreStageStore = PreStageState & PreStageActions;

/**
 * @description Initial state for the store, used for setup and reset.
 */
const initialState: PreStageState = {
  currentFile: null,
  isUploading: false,
  csv_file_path: '',
  choiceMap: [],
  problem_description: '',
  context_description: '',
  dataBackground: '',
  problem_name: '',
  file_columns: [],
  selectedProblemType: null,
  selectedTarget: null,
  datasetInfo: '',
};

const usePreStageStore = create<PreStageStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // --- Getters ---
    getDataBackground: () => get().dataBackground,
    getCurrentFile: () => get().currentFile,
    getIsUploading: () => get().isUploading,
    getFileColumns: () => get().file_columns,
    getDatasetInfo: () => get().datasetInfo,
    getCurrentChoiceMap: () => get().choiceMap,
    getProblemName: () => get().problem_name,

    // --- Actions ---
    setCurrentFile: async (file: File | null) => {
      if (get().isUploading) {
        console.warn('Already uploading, cannot set new file');
        return;
      }
      if (!file) {
        set({ currentFile: null });
        return;
      }
      set({ currentFile: file, isUploading: true });

      // Assuming analyzeDatasetStructure is typed to return Promise<AnalysisResult>
      try {
        const { columns, metadata }: AnalysisResult = await analyzeDatasetStructure(file);
        set({
          file_columns: columns,
          datasetInfo: metadata,
          // Note: You might want to set isUploading to false here after completion
          // isUploading: false,
        });
      } catch (error) {
        console.error("Failed to analyze dataset:", error);
        set({ isUploading: false }); // Reset uploading state on error
      }
    },

    setFileColumns: (columns: string[]) => set({ file_columns: columns }),
    setDataBackground: (background: string) => set({ dataBackground: background }),
    setDatasetInfo: (info: string) => set({ datasetInfo: info }),
    setIsUploading: (value: boolean) => set({ isUploading: value }),
    changeIsUploading: () => set((state) => ({ isUploading: !state.isUploading })),
    setCsvFilePath: (path: string) => set({ csv_file_path: path }),
    setProblemName: (name: string) => set({ problem_name: name }),
    setProblemDescription: (desc: string) => set({ problem_description: desc }),
    setContextDescription: (desc: string) => set({ context_description: desc }),

    setSelectedProblem: (target: string, description: string, problemName: string) =>
      set({
        selectedTarget: target,
        problem_description: description,
        problem_name: problemName,
      }),

    updateChoiceMap: (choiceMap: any[]) => {
      if (Array.isArray(choiceMap)) {
        set({ choiceMap });
      }
    },

    resetStore: () => set(initialState),
  })),
);

export default usePreStageStore;