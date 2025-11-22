import type {
  UploadFile,
  AICommandInputProps,
  VDSQuestion,
  AddCellFn,
  EmptyStateProps,
} from '@Store/models';
export type { UploadFile, AICommandInputProps, VDSQuestion, AddCellFn, EmptyStateProps };

declare global {
  interface Window {
    changeTypingText?: (newText: string) => void;
  }
}
