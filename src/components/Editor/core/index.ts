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

export {
  CommandRegistry,
  cellIdAt,
  isNodeActiveIn,
  isMarkActiveIn,
  deriveContextHelpers,
} from './NotebookCommand';
export type {
  NotebookCommand,
  CommandContext,
  FullCommandContext,
  CommandGroup,
  CommandSurface,
  ResolvedCommand,
  ListOptions,
  RunOptions,
  PMKeymapHandler,
} from './NotebookCommand';

export { BufferingIntentSink } from './intents';
export type { EditorIntent, IntentSink } from './intents';

export {
  txCommand,
  serviceCommand,
  first,
  sequence,
  when,
  tap,
  byId,
  createBuiltinCommands,
  SPECIAL_DOWNGRADE,
  resetBuiltinIdCounter,
} from './commands';
export type { CommandMeta, CommandFn } from './commands';

export { minimalSchema } from './schema.minimal';
export { notebookSchema, NODE } from './schema';

export {
  NotebookSerializer,
  parseMarkdown,
  serializeMarkdown,
  cellsToDoc,
  docToCells,
  fromCells,
  toCells,
  legacySnapshotToDoc,
  toJSON,
  fromJSON,
} from './NotebookSerializer';
export type { NotebookJSON } from './NotebookSerializer';

export type {
  NotebookStorePort,
  NotebookServices,
  ExecutionService,
  AIService,
  UploadService,
  ImageGenService,
  CellLike,
  CellType,
  NodeIdGenerator,
} from './ports';
