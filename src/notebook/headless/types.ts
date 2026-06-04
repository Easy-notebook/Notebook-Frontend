import type React from 'react';

export type EasyNotebookCellType =
  | 'markdown'
  | 'code'
  | 'raw'
  | 'hybrid'
  | 'image'
  | 'thinking'
  | 'link'
  | (string & {});

export interface EasyNotebookOutput {
  type: string;
  content: unknown;
  timestamp?: string;
  key?: string | number;
  metadata?: Record<string, unknown>;
}

export interface EasyNotebookCell {
  id: string;
  type: EasyNotebookCellType;
  content: string;
  outputs?: EasyNotebookOutput[];
  enableEdit?: boolean;
  phaseId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface EasyNotebookDocument {
  id?: string | null;
  title?: string;
  cells: EasyNotebookCell[];
  metadata?: Record<string, unknown>;
}

export type EasyNotebookCellPatch = Partial<Omit<EasyNotebookCell, 'id'>>;

export interface EasyNotebookChangeEvent {
  type:
    | 'insert_cell'
    | 'update_cell'
    | 'delete_cell'
    | 'move_cell'
    | 'set_outputs'
    | 'replace_document';
  cellId?: string;
  cell?: EasyNotebookCell;
  patch?: EasyNotebookCellPatch;
  fromIndex?: number;
  toIndex?: number;
}

export interface EasyNotebookExecutionContext {
  cell: EasyNotebookCell;
  notebook: EasyNotebookDocument;
}

export interface EasyNotebookExecutionResult {
  outputs?: EasyNotebookOutput[];
  patch?: EasyNotebookCellPatch;
}

export type EasyNotebookExecutor = (
  context: EasyNotebookExecutionContext
) => Promise<EasyNotebookExecutionResult | EasyNotebookOutput[] | void>;

export interface EasyNotebookCellActions {
  updateCell: (cellId: string, patch: EasyNotebookCellPatch) => void;
  updateContent: (cellId: string, content: string) => void;
  deleteCell: (cellId: string) => void;
  insertCellAfter: (cellId: string, type?: EasyNotebookCellType) => void;
  moveCell: (cellId: string, direction: 'up' | 'down') => void;
  setOutputs: (cellId: string, outputs: EasyNotebookOutput[]) => void;
  executeCell: (cellId: string) => Promise<void>;
}

export interface EasyNotebookCellComponentProps {
  cell: EasyNotebookCell;
  index: number;
  notebook: EasyNotebookDocument;
  readOnly: boolean;
  actions: EasyNotebookCellActions;
}

export type EasyNotebookCellComponent = React.ComponentType<EasyNotebookCellComponentProps>;

export interface EasyNotebookCellToolbarProps extends EasyNotebookCellComponentProps {
  isExecuting: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  hasExecutor: boolean;
}

export interface EasyNotebookCellFrameProps extends EasyNotebookCellComponentProps {
  children: React.ReactNode;
  toolbar: React.ReactNode;
}

export interface EasyNotebookOutputRendererProps {
  output: EasyNotebookOutput;
  cell: EasyNotebookCell;
  index: number;
}

export interface EasyNotebookEmptyStateProps {
  onInsertCell: (type?: EasyNotebookCellType) => void;
}

export interface EasyNotebookEditorComponents {
  CellFrame?: React.ComponentType<EasyNotebookCellFrameProps>;
  CellToolbar?: React.ComponentType<EasyNotebookCellToolbarProps>;
  OutputRenderer?: React.ComponentType<EasyNotebookOutputRendererProps>;
  EmptyState?: React.ComponentType<EasyNotebookEmptyStateProps>;
  cells?: Partial<Record<EasyNotebookCellType, EasyNotebookCellComponent>>;
}

export interface EasyNotebookEditorAction {
  type:
    | 'insert_cell'
    | 'update_cell'
    | 'delete_cell'
    | 'move_cell'
    | 'set_outputs'
    | 'replace_document';
  cellId?: string;
  cell?: EasyNotebookCell;
  patch?: EasyNotebookCellPatch;
  outputs?: EasyNotebookOutput[];
  index?: number;
  fromIndex?: number;
  toIndex?: number;
  document?: EasyNotebookDocument;
}
