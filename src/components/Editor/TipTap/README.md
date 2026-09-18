# Notebook editor architecture

`TiptapNotebookEditor` is the React boundary. `config/extensions.ts` is the only
registration point for its TipTap extensions. The active custom nodes are exported
from `../extensions/index.ts`; implementations live in `../extensions/implementations/`.

The TipTap document owns cell order, Markdown text, and editable selection.
`markdownCell` and `title` nodes carry stable cell IDs. The notebook store owns
execution data, outputs, and metadata not represented by a document node.
`model/reconcileCells.ts` combines a document projection with store-owned data.

`hooks/useEditorEvents.ts` publishes editor-originated changes to the store.
`hooks/useEditorSync.ts` handles external store changes; `model/documentSync.ts`
replaces only the changed top-level block range and marks the transaction as an
external sync. The store's persistence subscription owns autosave; editor hooks do
not run a second save path on blur or unload.

When adding a node type, update its extension, HTML-to-document conversion,
document-to-cell conversion, and round-trip tests together. Keep one active
implementation per node name.
