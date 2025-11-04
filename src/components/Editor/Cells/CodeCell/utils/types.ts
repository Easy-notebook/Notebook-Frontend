// Types for CodeCell and related components

export interface Cell {
  id: string;
  content: string;
  outputs?: Output[];
  description?: string;
}

export interface Output {
  type: 'image' | 'text' | 'error' | 'html';
  content: string;
  key?: string;
}

export interface CodeCellProps {
  cell: Cell;
  onDelete?: (cellId: string) => void;
  dslcMode?: boolean;
  finished_thinking?: boolean;
  thinkingText?: string;
  isInDetachedView?: boolean;
  isDemoMode?: boolean;
}

export interface CellToolbarProps {
  isExecuting: boolean;
  isCancelling: boolean;
  elapsedTime: number;
  cellMode: string;
  isDetached: boolean;
  isInDetachedView: boolean;
  isDemoMode: boolean;
  processedOutputs: Output[];
  cell: Cell;
  showAIdebug: boolean;
  showToolbar: boolean;
  onExecute: () => void;
  onCancel: () => void;
  onRestart: () => void;
  onClearOutput: () => void;
  onToggleCellMode: () => void;
  onToggleDetached: () => void;
  onDelete?: (cellId: string) => void;
  onToggleFullscreen?: () => void;
  isDetachedCellFullscreen?: boolean;
}

export interface CodeEditorProps {
  cell: Cell;
  isExecuting: boolean;
  isCurrentCell: boolean;
  dslcMode: boolean;
  isInDetachedView: boolean;
  contentHeight: number;
  isExpanded: boolean;
  isHovering: boolean;
  editorRef: React.MutableRefObject<unknown>;
  codeBlockWrapperRef: React.RefObject<HTMLDivElement>;
  onHoverChange: (isHovering: boolean) => void;
  onExpand: () => void;
  onCollapse: () => void;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onCopyCode: () => void;
}

export interface OutputDisplayProps {
  outputs: Output[];
  isExecuting: boolean;
  elapsedTime: number;
  outputVisible: boolean;
  outputUpdateKey: number;
  cellMode: string;
  isInDetachedView: boolean;
  finished_thinking?: boolean;
  dslcMode?: boolean;
  showThinking?: boolean;
  thinkingText?: string;
  onToggleThinking?: () => void;
}
