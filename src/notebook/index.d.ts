import type React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Root } from 'react-dom/client';

export type EasyNotebookRouterMode = 'auto' | 'browser' | 'hash' | 'none';
export type EasyNotebookLayout = 'viewport' | 'container';
export type ControlledNotebookDisplayMode = 'edit' | 'preview' | 'split';
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
  children: ReactNode;
  toolbar: ReactNode;
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

export declare class EasyNotebookDocumentModel {
  constructor(document: EasyNotebookDocument);
  static empty(init?: Partial<EasyNotebookDocument>): EasyNotebookDocumentModel;
  static from(document: EasyNotebookDocument): EasyNotebookDocumentModel;
  get id(): string | null | undefined;
  get title(): string;
  get cells(): EasyNotebookCell[];
  get cellCount(): number;
  cellById(cellId: string): EasyNotebookCell | null;
  cellAt(index: number): EasyNotebookCell | null;
  insertCell(
    cell?: EasyNotebookCell | EasyNotebookCellType,
    index?: number
  ): EasyNotebookDocumentModel;
  updateCell(cellId: string, patch: EasyNotebookCellPatch): EasyNotebookDocumentModel;
  deleteCell(cellId: string): EasyNotebookDocumentModel;
  moveCell(fromIndex: number, toIndex: number): EasyNotebookDocumentModel;
  setOutputs(cellId: string, outputs: EasyNotebookOutput[]): EasyNotebookDocumentModel;
  reduce(action: EasyNotebookEditorAction): EasyNotebookDocumentModel;
  toJSON(): EasyNotebookDocument;
}

export declare const createNotebookCell: (
  type?: EasyNotebookCellType,
  init?: Partial<EasyNotebookCell>
) => EasyNotebookCell;

export declare const reduceEasyNotebookDocument: (
  document: EasyNotebookDocument,
  action: EasyNotebookEditorAction
) => EasyNotebookDocument;

export interface EasyNotebookContainerProps {
  className?: string;
  initialRoute?: string;
  layout?: EasyNotebookLayout;
  routerMode?: EasyNotebookRouterMode;
  showBackground?: boolean;
  showToaster?: boolean;
  style?: CSSProperties;
}

export interface NotebookRuntimeProviderProps {
  children: ReactNode;
  showBackground?: boolean;
  showToaster?: boolean;
}

export interface NotebookAppProps {
  className?: string;
  layout?: EasyNotebookLayout;
}

export interface ControlledNotebookEditorProps {
  value: EasyNotebookDocument;
  onChange: (next: EasyNotebookDocument, event: EasyNotebookChangeEvent) => void;
  className?: string;
  displayMode?: ControlledNotebookDisplayMode;
  readOnly?: boolean;
  executor?: EasyNotebookExecutor;
  components?: EasyNotebookEditorComponents;
  executingCellIds?: string[];
  onExecutionStart?: (cell: EasyNotebookCell) => void;
  onExecutionComplete?: (cell: EasyNotebookCell, outputs: EasyNotebookOutput[]) => void;
  onExecutionError?: (cell: EasyNotebookCell, error: unknown) => void;
}

export interface MountedEasyNotebook {
  root: Root;
  unmount: () => void;
}

export declare const EasyNotebookContainer: React.FC<EasyNotebookContainerProps>;
export declare const NotebookRuntimeProvider: React.FC<NotebookRuntimeProviderProps>;
export declare const NotebookApp: React.FC<NotebookAppProps>;
export declare const ControlledNotebookEditor: React.FC<ControlledNotebookEditorProps>;
export declare const mountEasyNotebook: (
  target: HTMLElement | string,
  options?: EasyNotebookContainerProps
) => MountedEasyNotebook;
