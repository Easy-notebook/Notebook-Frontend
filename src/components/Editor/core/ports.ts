/**
 * Injection ports for the NotebookEditorCore (Phase 1 scaffold).
 *
 * These interfaces are the SDK's extension contract. The core depends only on
 * these abstractions — never on Zustand, `fetch`, or the app's services. Concrete
 * implementations (the Zustand-backed store port, the HTTP executor, …) are
 * supplied from outside via `NotebookEditorCore` options / `setServices`.
 *
 * See docs/migration/00-architecture-and-core-api.md §5.6–5.8.
 */

/** Legacy `CellType` union (store models/cell.ts). */
export type CellType = 'code' | 'markdown' | 'raw' | 'hybrid' | 'image' | 'thinking' | 'link';

/**
 * Legacy cell projection shape (kept for interop / store bridge only).
 *
 * Mirrors `src/store/models/cell.ts` `Cell`: `content` is never null (defaults
 * to ''), `outputs` is an `OutputItem[]`/string[] hybrid, and the open index
 * signature round-trips unknown keys through `notebookCell.metadata`.
 */
export interface CellLike {
  id: string;
  type: CellType | string;
  content?: string;
  outputs?: unknown[];
  enableEdit?: boolean;
  phaseId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * The external state boundary. The core stays store-agnostic; exactly one
 * adapter implementation knows about Zustand (`adapter/NotebookAdapter.ts`,
 * Phase 4). The core only ever reads/writes through this port.
 */
export interface NotebookStorePort {
  getCells(): CellLike[];
  setCells(cells: CellLike[]): void;
  updateCell(id: string, patch: Partial<CellLike>): void;
  setCurrentCell?(id: string | null): void;
  setEditingCellId?(id: string | null): void;
}

/** Code execution, injected — replaces direct `CodeExecutionService` coupling. */
export interface ExecutionService {
  execute(cellId: string, code: string, language: string): Promise<void>;
  cancel(cellId: string): void;
}

/** AI streaming, injected. `append` is incremental (insertText), not rewrite. */
export interface AIService {
  append(cellId: string, text: string): void;
  generate(prompt: string, at: number): Promise<string>;
}

export interface UploadService {
  upload(file: File): Promise<{ src: string }>;
}

export interface ImageGenParams {
  prompt: string;
  [key: string]: unknown;
}

export interface ImageGenService {
  generate(params: ImageGenParams): Promise<{ src: string }>;
}

/** The bundle of injected capabilities exposed to commands via CommandContext. */
export interface NotebookServices {
  execution?: ExecutionService;
  ai?: AIService;
  upload?: UploadService;
  imageGen?: ImageGenService;
}
