import type { EasyNotebookEditorComponents } from '../../headless';
import { ProseMirrorMarkdownCell } from './ProseMirrorMarkdownCell';

export { ProseMirrorMarkdownCell } from './ProseMirrorMarkdownCell';

/**
 * Default per-cell-type editor components. Mounts the ProseMirror-backed
 * markdown body in place of the legacy textarea + ReactMarkdown. Other cell
 * types fall through to the built-in `DefaultCellBody`.
 *
 * Merged into any caller-supplied `components` by `ControlledNotebookEditor`
 * (caller overrides win), so consumers can opt out per cell type without
 * touching the editor.
 */
export const defaultProseMirrorCells: NonNullable<EasyNotebookEditorComponents['cells']> = {
  markdown: ProseMirrorMarkdownCell,
};
