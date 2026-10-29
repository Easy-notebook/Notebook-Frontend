# Notebook editor

The rich editor uses Lexical's extension composer and official CommonMark/GFM
pipeline. The notebook remains a list of `Cell` records; Lexical JSON is an
internal editing representation, not a new persistence format.

## Ownership and layers

- `model/`: stable cell identities, rich-text nodes, scientific Markdown grammar,
  source-preserving import/export, and table semantics. Unedited cells retain
  their original Markdown bytes. Edited cells serialize through one pipeline.
- `interaction/`: notebook session lifecycle, source transitions and keyboard
  transactions. `NotebookEditorSession` owns synchronization between the tree
  and notebook store; plugins do not create competing synchronization loops.
- `plugins/`: React adapters for selection, formatting, slash commands, uploads,
  navigation, table resizing and the existing imperative editor API.
- `components/`: presentation adapters. Code, hybrid, agent, thinking and file
  attachment cells reuse the existing notebook components and their services.
  Formula/image controls and the cover retain their existing markup and styles.
- `extensionPoints.ts`: one immutable contribution registry for schema
  extensions and React plugins. Duplicate plugin IDs and explicit node types
  are rejected at composition time.

`NotebookEditor.tsx` is the composition root. Add a capability through the
registry, with parsing/state in the model layer and event handling in a plugin.
Do not add model-specific conditionals to notebook persistence or agent code.

## Session and conflict semantics

A session belongs to one notebook ID and progresses through `creating`, `ready`,
`publishing`, `synchronizing`, and `disposed`. Notebook navigation disposes its
subscriptions and blocks late uploads and edits. StrictMode may attach a new
subscription lifetime to the same session object after cleanup.

The tree owns authored text, cell order and source/preview transitions. The store
owns execution outputs, agent state and business metadata. Projection merges
these responsibilities instead of replacing execution results with stale node
snapshots. Unaffected external cells retain their node keys.

Source drafts use compare-and-set against the source they began editing. A stale
raw-text draft stays visible for recovery instead of overwriting an agent edit.
External authored changes establish an undo boundary; execution-output-only
updates do not. Source textareas and rich text share Lexical history, including
native edit-menu undo/redo and composition guards.

## Presentation and interaction contract

Keep the existing notebook CSS, typography, cover, cell toolbars and previews.
The migration changes engine ownership, not the notebook's visual language.
Existing source/preview gestures, title Enter, slash commands, selection toolbar,
source indentation shortcuts, table keyboard navigation/resizing and file drop
remain entry points to the same notebook operations. The Jupyter editor remains
an independent user-selectable mode.

Outline projection lives beside the sidebar, outside the editor. It reads actual
Markdown headings and uses cell identity plus heading ordinal for navigation,
so duplicate headings and headings inside one cell are distinguishable. Fenced
code and execution output are excluded.

Persisted editor preferences are migrated once to `lexical` on read. The public
stream command `tiptap_update` remains a protocol name handled by
`RichTextUpdateAction`; no TipTap runtime or parallel document model remains.

## Verification

Model tests cover source fidelity, rich tables, formulas/images, unfinished
fences, HTML export/import, session isolation, external edits, title splitting,
read-only mutation guards, ordered insertion and undo conflicts. Shared inline
Markdown and native source history tests cover formatting and keyboard behavior.
`tests/browser/lexical-editor.html` provides an isolated visual fixture for light
and dark themes, read-only mode, all heading levels, lists, code and tables.

## Block tools and keyboard boundaries

`NotebookBlockCommands` owns block insertion, conversion, cloning, deletion,
reordering and metadata edits. The gutter plugin owns only hover/menu/drag state.
Executable cells remain notebook-root records; rich block moves split cell
boundaries without moving unrelated paragraphs. Async clipboard cuts compare
source again before deletion. Disposed sessions and read-only editors reject
mutations.

`PersistentBlockExtension` stores callouts, disclosures, block addresses, labels
and colors in versioned Markdown comments. `ColumnsExtension` owns layout,
resizing and reversible stacking. Both use the same Markdown import/export
pipeline as existing content. Executable cells cannot be nested inside columns.

`CellBoundaryNavigation` transfers selection between Lexical and the existing
CodeMirror activation router. Backspace/Delete at adjacent rich-text boundaries
focus the code cell instead of deleting it. Heading/quote Backspace first restores
a paragraph. Formula/image inputs stop their own keyboard events from reaching
the notebook. `NotebookHistoryPlugin` seeds each new external revision so even
the first subsequent local edit can be undone.

### Continuous writing and Textus reference

The reference is Textus `7a6177d974a1dcc253255415608806885401889d`, including
`textus-promo-en-github.mp4` 6–12 seconds. `NotebookMarkdownInput` commits a typed
heading, quote, list, or rule at Enter inside a notebook cell. It does not change
cell boundaries to shadow roots just to accommodate a document-level shortcut.
Code fences continue through `FenceInputPlugin` and the existing execution model.
A quote continues with a line break; Enter on an empty quote line exits into prose.

`MarkdownSourceEditing` derives rendered/source state from the document selection.
The caret's fragment expands into `MarkdownSourceNode`, a real inline Lexical
container with ordinary text children. It remains inside its paragraph: native
wrapping, selection, IME and clipboard all use the main contenteditable. Leaving
the source parses that fragment through the existing mdast codec. The source
extension exports literal Markdown during editing, so autosave and undo retain
the actual text, without an external draft or a late overwrite. Source transitions
merge into history; text edits use normal editor history. Shortcut conversion is
suspended while the caret edits source. `MarkdownSourcePreview` parses each changed
active fragment with the same mdast registry, applies formats to content spans
while retaining literal delimiters, and restores selection by source offsets.
Incomplete syntax removes stale styles immediately; completing it restores them. Selected replacements retain the source
container, and arrow commands preserve its editable first/last positions.
Code and Agent nodes are excluded. Ordinary link clicks edit source rather than
navigate; modified clicks and Cmd/Ctrl+K retain explicit link actions.

`NotebookEditorSession` serializes changed prose cells during normal typing,
tracking dirty-node ownership in both the previous and current document. Undo
and redo serialize the full restored snapshot. Executable and Agent cell state
remains store-owned.

Writing services are separate from their UI: `FindController`, `WritingAssistant`,
`WritingCompletion`, and `WritingModelClient`. The model client reuses the Agent
bridge but declines tool execution. Proposals use source compare-and-swap before
acceptance; completions expire on input, navigation, composition, cancellation,
or notebook switch. A keyboard completion is applied inside its existing Lexical
transaction, never by nesting a discrete update.

This is not a claim of complete Textus parity. Editable delimiter shells at every
caret position, regex search, automatic grammar annotations, pinned review
comments, wiki/reference-link editing and footnote workflows still need explicit
implementation and browser verification. The current source view is per-cell,
with executable cells protected; it is not a single flattened Markdown textarea.

Active block source uses `MarkdownSourceBlockNode`: its stable Lexical identity owns a parsed semantic kind while the DOM changes between paragraph, heading, quotation and list. The shared Markdown grammar updates this kind on edits; leaving source restores ordinary document nodes. Editing a list item splits and rejoins adjacent lists without changing item order. Inline source previews use real link nodes with current destinations, and arrow movement uses absolute source offsets across formatted children.
