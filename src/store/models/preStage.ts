// src/store/models/preStage.ts

export interface DatasetMetadata {
  rowCount: number;
  columnCount: number;
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  missingValueSummary: Record<string, number>;
  uniqueValueCounts: Record<string, number>;
  stats: Record<string, any>;
}

export interface AnalysisResult {
  columns: string[];
  metadata: DatasetMetadata;
}

export interface PreStageState {
  currentFile: File | null;
  isUploading: boolean;
  csv_file_path: string;
  file_columns: string[];
  problem_name: string;
  problem_description: string;
  context_description: string;
  dataBackground: string;
  datasetInfo: string;
  selectedProblemType: string | null;
  selectedTarget: string | null;
  choiceMap: any[];
}

export interface PreStageActions {
  getDataBackground: () => string;
  getCurrentFile: () => File | null;
  getIsUploading: () => boolean;
  getFileColumns: () => string[];
  getDatasetInfo: () => string;
  getCurrentChoiceMap: () => any[];
  getProblemName: () => string;

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

export type PreStageStore = PreStageState & PreStageActions;
