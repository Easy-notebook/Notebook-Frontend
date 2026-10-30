import { NotebookPluginRegistry } from '../extensionPoints';
import { PersistentBlockExtension } from '../blocks/PersistentBlockExtension';
import { ColumnsExtension } from '../columns/ColumnsExtension';
import { TextFormattingExtension } from './TextFormatting';
import { NotebookHtmlExtension } from './NotebookHtml';
import { MarkdownTableSemanticsExtension } from './MarkdownTable';
import { FencedCodeSourceExtension } from './FencedCodeSource';
import { ImageExtension } from './ImageNode';
import { ScientificExtension } from './ScientificNode';

/** One content grammar for authored documents and isolated read-only previews. */
export const notebookContent = new NotebookPluginRegistry([
  { id: 'block-schema', extensions: [PersistentBlockExtension, ColumnsExtension] },
  { id: 'text-formatting', extensions: [TextFormattingExtension] },
  { id: 'html', extensions: [NotebookHtmlExtension] },
  { id: 'fences', extensions: [FencedCodeSourceExtension] },
  { id: 'table-schema', extensions: [MarkdownTableSemanticsExtension] },
  { id: 'images', extensions: [ImageExtension] },
  { id: 'scientific', extensions: [ScientificExtension] },
]);
