export interface UploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  file: File;
}

export interface CommandContext {
  notebookId: string;
  currentCellId: string | null;
  viewMode: string;
  currentPhaseId: string | null;
  currentStepIndex: number;
  actionsToShow: any[]; // Replace 'any' with actual Action type if available
  qasToShow: any[]; // Replace 'any' with actual QA type if available
  currentViewCells: any[]; // Replace 'any' with actual Cell type
}
