import { Commands } from '@tiptap/core';

export interface ThinkingCellAttributes {
  cellId?: string;
  agentName?: string;
  customText?: string | null;
  textArray?: string[];
  useWorkflowThinking?: boolean;
}

export interface LaTeXOptions {
  latex: string;
  displayMode: boolean;
}

export interface ImageOptions {
  src?: string;
  alt?: string;
  title?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setLaTeX: {
      setLaTeX: (options: LaTeXOptions) => ReturnType;
    };
    setImage: {
      setImage: (options: ImageOptions) => ReturnType;
    };
    thinkingCell: {
      setThinkingCell: (attributes: Partial<ThinkingCellAttributes>) => ReturnType;
      insertThinkingCell: (attributes: Partial<ThinkingCellAttributes>) => ReturnType;
    };
  }
}
