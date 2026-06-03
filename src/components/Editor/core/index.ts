/**
 * @easynotebook/core — public entry (Phase 1 scaffold).
 *
 * Framework-free ProseMirror-first notebook editor kernel. Depends on
 * `prosemirror-*` only. The React shell (`ControlledNotebookEditor`, Phase 4)
 * and the store adapter (`NotebookAdapter`, Phase 4) build on this surface.
 */
export { NotebookEditorCore } from './NotebookEditorCore';
export type { CoreOptions, ChangeEvent, Disposer } from './NotebookEditorCore';

export { NotebookDoc } from './NotebookDoc';
export { NotebookCell } from './NotebookCell';
export type { CellKind } from './NotebookCell';

export { NotebookTransaction, EXTERNAL_META, NO_HISTORY_META } from './NotebookTransaction';
export type { ChangeKind } from './NotebookTransaction';

export { CommandRegistry } from './NotebookCommand';
export type { NotebookCommand, CommandContext } from './NotebookCommand';

export { minimalSchema } from './schema.minimal';

export type {
  NotebookStorePort,
  NotebookServices,
  ExecutionService,
  AIService,
  UploadService,
  ImageGenService,
  CellLike,
} from './ports';
