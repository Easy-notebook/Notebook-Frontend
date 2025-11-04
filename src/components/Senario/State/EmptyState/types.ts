export interface UploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  file: File;
}

export interface AICommandInputProps {
  files: UploadFile[];
  setFiles: React.Dispatch<React.SetStateAction<UploadFile[]>>;
}

export interface VDSQuestion {
  problem_name: string;
  problem_description: string;
}

export type AddCellFn = ((type: 'markdown' | 'code') => void) | (() => void);

export interface EmptyStateProps {
  onAddCell: AddCellFn;
  onFileUpload?: () => void;
}

declare global {
  interface Window {
    changeTypingText?: (newText: string) => void;
  }
}