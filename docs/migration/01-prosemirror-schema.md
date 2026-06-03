I'll write the design document directly based on the audit. The audit provides comprehensive detail on the current cell types, their data shapes, and migration concerns, so I have what I need to define the schema.

# ProseMirror Schema Design — `@easynotebook` Notebook Core

> **Status:** Design proposal for the PM-first refactor.
> **Scope:** This document defines the canonical ProseMirror **schema** (node specs, attrs, content expressions, marks, DOM round-trip) for the notebook editor core. It is the contract that every other subsystem — serializer, command registry, executor, React view adapter, persistence — agrees on. It is deliberately framework-free: no React, no Zustand, no i18n, no `window`.

---

## 0. Design Principles

These principles flow directly from the refactor goals and the audit findings, and they constrain every node spec below.

1. **The PM document is the single source of truth.** There is no canonical `cells: Cell[]` array. The legacy flat array becomes a *projection* produced by `NotebookSerializer.docToCells()` only at interop/export boundaries. The `convertCellsToHtml` / `convertEditorStateToCells` two-way HTML bridge (the audit's "lossy heart") is deleted.
2. **Structure lives in the schema, not in regex.** Cell boundaries, title-first invariant, code/output separation, and heading-derived outline all become schema/plugin facts rather than string parsing over `cell.content`.
3. **Editable text is real PM content; opaque payloads are attrs.** The audit's anti-pattern — every cell is an `atom:true` block whose content is JSON-in-`data-*`-attrs owned by a React NodeView reading Zustand — is reversed where it matters: markdown text and code text become PM-owned content. Genuinely non-textual payloads (rendered outputs, generation params) stay as structured attrs.
4. **Stable identity.** Every cell-level node carries a persistent `cellId` that survives split/merge/paste/move. Async streaming, generation tracking, output write-back, and autosave all resolve targets by `cellId`.
5. **Execution state is bifurcated.** *Durable* results (`outputs`, `executionCount`, `status`) live in the document. *Ephemeral* runtime state (`isExecuting`, `elapsedTime`, `isCancelling`) never enters the doc/undo history — it lives in plugin state keyed by `cellId` and surfaces via decorations.
6. **Read-only is schema-enforced, not conventional.** Outputs become a non-editable atom node. The in-band sentinel strings `[error-message-for-debug]` / `[without-output]` are replaced by an explicit `status` field.

---

## 1. Schema Overview

### 1.1 Node tree (content model)

```
notebook                         (doc root; top node)
└─ titleBlock                    (exactly one, first — replaces "title" cell invariant)
└─ notebookCell+                 (1..n cells; the only repeatable top-level child)
   └─ <one cell-body node>:
        markdownBlock            (rich text; the editable prose cell)
      | codeCell                 (editable code text + optional outputBlock child)
      | imageBlock               (atom; uploaded or AI-generated image)
      | thinkingBlock            (atom; AI streaming / loading placeholder)
      | rawBlock                 (verbatim text; pass-through)
      | table                    (GFM table; native PM table family)
```

`outputBlock` is **not** a top-level node — it is a child of `codeCell` only.

### 1.2 Groups

| Group | Members | Purpose |
|---|---|---|
| `cellBody` | `markdownBlock`, `codeCell`, `imageBlock`, `thinkingBlock`, `rawBlock`, `table` | The set of things a `notebookCell` may wrap. Lets the content expression stay open for extension. |
| `block` (inline-content blocks) | `markdownBlock`, headings/paragraphs *inside* markdownBlock | Standard PM block flow inside rich-text cells. |
| `inline` | text + inline atoms (`mathInline`, `inlineImage`) | Inline content for `markdownBlock`. |

> **Why wrap every cell in `notebookCell`?** A uniform wrapper node carries cross-cutting cell concerns (`cellId`, `phaseId`, `enableEdit`, drag handle target, decoration anchor) *once*, instead of duplicating those attrs on six different body nodes. It also gives a single, stable node type for keymaps/commands ("act on the current cell") and for the `SimpleDragManager` successor to target. This replaces the audit's `BaseExtension` pattern (which forced `cellId`+`fsmState` onto every node and made all of them `atom:true`).

### 1.3 Marks

Marks are allowed **only inside `markdownBlock`** (and table cells). Code, raw, image, and thinking bodies carry no marks.

| Mark | Notes |
|---|---|
| `strong`, `em`, `code`, `strike` | Standard. `extractTextFromNode` today only handles these four — we keep parity and add a real serializer so new marks don't silently drop. |
| `link` | Preserve the `file://` + `wikilink` protocols from the current `Link`/`WikiLinkInput` extensions. |

---

## 2. Node Specifications

Each spec gives: **content**, **group**, **attrs**, **atom/selectable/editable**, **marks**, **`parseDOM`/`toDOM` sketch**, and notes.

### 2.1 `notebook` (doc / top node)

```ts
notebook: {
  topNode: true,
  content: "titleBlock notebookCell+",
  attrs: {
    notebookId: { default: null },
    schemaVersion: { default: 2 },        // for back-compat migration of persisted docs
    meta: { default: {} },                // frontmatter sink (author, created, tags…)
  },
}
```

- **Content:** enforces the **title-first invariant** structurally (today this is patched heuristically in three places — `onTransaction`, `onUpdate`, language-change effect). The schema now guarantees `titleBlock` is index 0; no protective code needed.
- **`meta`** absorbs YAML frontmatter so import/export is symmetric (today frontmatter is write-only and re-importing `---` corrupts).
- Not serialized to a wrapping DOM element in the editor; `toDOM` returns `["div", { class: "nb-notebook", "data-notebook-id": ... }, 0]` for clipboard/SSR.

---

### 2.2 `titleBlock`

```ts
titleBlock: {
  content: "inline*",
  marks: "",                              // plain text title; no bold/links in title
  attrs: {
    cellId: { default: null },
    isDefault: { default: false },        // replaces metadata.isDefaultTitle
    icon: { default: null },              // notebook cover icon (was special-cased)
    cover: { default: null },
  },
  defining: true,
  toDOM: n => ["h1", { "data-type": "title", "data-cell-id": n.attrs.cellId,
                       "data-default": n.attrs.isDefault ? "1" : null }, 0],
  parseDOM: [{ tag: "h1[data-type=title]", getAttrs: dom => ({
    cellId: dom.getAttribute("data-cell-id"),
    isDefault: dom.getAttribute("data-default") === "1",
  }) }],
}
```

- Replaces the mandatory `Document { content: 'title block+' }` + `TitleExtension`/`TitleNodeView`.
- **Default-title localization** (the `'Untitled'`/`'未命名'` logic baked into `useEditorEvents` + a re-translate-on-language-change effect) moves **out of the schema**. The schema stores `isDefault: true` and empty content; the React shell renders a localized *placeholder decoration*. Language change re-renders the decoration, never mutates the doc. This removes i18n coupling from the core entirely.
- `title ↔ notebookTitle` two-way sync (audit's special case) becomes: shell subscribes to title-node text changes and pushes to the external model; no in-doc duplication.

---

### 2.3 `notebookCell` (cell wrapper)

```ts
notebookCell: {
  content: "(markdownBlock | codeCell | imageBlock | thinkingBlock | rawBlock | table)",
  group: "cell",
  attrs: {
    cellId:   { default: null },          // STABLE, persistent, unique
    phaseId:  { default: null },          // DERIVED by outline plugin; not authored
    enableEdit: { default: true },
    collapsed:  { default: false },
    description:{ default: null },
    metadata:   { default: {} },          // open bag, but no longer [key:string]:any on the model
  },
  selectable: false,                      // you select the body, not the wrapper
  draggable: true,                        // drag handle targets this node
  toDOM: n => ["div", {
    class: "nb-cell",
    "data-cell-id": n.attrs.cellId,
    "data-phase-id": n.attrs.phaseId,
    "data-enable-edit": n.attrs.enableEdit ? "1" : "0",
  }, 0],
  parseDOM: [{ tag: "div.nb-cell", getAttrs: dom => ({
    cellId: dom.getAttribute("data-cell-id"),
    enableEdit: dom.getAttribute("data-enable-edit") !== "0",
  }) }],
}
```

- **Content is exactly one body node.** This keeps the "one cell = one logical unit" model the rest of the app expects (outline, autosave granularity, generation targeting) while letting the body be rich.
- **`phaseId` is derived, never authored.** Today `parseMarkdownCells` + `updateCellsPhaseId` re-stamp `phaseId` onto cells on *every* mutation. Here, an **OutlinePlugin** walks `titleBlock` + `markdownBlock` headings and emits a derived `phaseId` per cell via decoration/plugin state; it does not need to be a stored attr at all. We keep the attr only as a serialization mirror for legacy snapshot import. (See §5.)
- **`cellId` stability** is enforced by an `AppendTransaction` plugin: any newly inserted `notebookCell` with `cellId == null` (split, paste, programmatic insert) gets a fresh `uuid`; duplicate `cellId`s (from copy) are re-issued. This guarantees the invariant the audit flags as critical for generation tracking + output write-back.

---

### 2.4 `markdownBlock` (rich-text cell body)

```ts
markdownBlock: {
  content: "block+",                      // paragraphs, headings, lists, blockquote, code_block, hr…
  group: "cellBody",
  marks: "_",                             // all registered marks allowed within
  attrs: {},                              // identity lives on the parent notebookCell
  toDOM: () => ["div", { class: "nb-md", "data-type": "markdown" }, 0],
  parseDOM: [{ tag: "div[data-type=markdown]" }],
}
```

- **This is the big inversion.** Today markdown cells are *atom* blocks; their content is a markdown **string** round-tripped through hand-rolled regex HTML. Here, markdown is **native PM rich content** (`block+` → `paragraph`/`heading`/`bullet_list`/`ordered_list`/`blockquote`/`horizontalRule`/`code_block`/`mathDisplay`/`table`-not-here). Editing happens in ProseMirror, not inside a React NodeView reading the store.
- **Marks** (`strong`/`em`/`code`/`strike`/`link`) are real PM marks, so the four-mark ceiling and "new mark silently drops" problem from `extractTextFromNode` disappears.
- Inline atoms: `mathInline`, `inlineImage`, hard breaks. `$...$` vs `$$...$$` math is disambiguated by *node type* (`mathInline` vs `mathDisplay`) at parse time via `remark-math`, not by the current "trim-the-whole-line" heuristic that collapses inline into display.
- **Headings inside `markdownBlock`** keep id preservation (the current id-preserving `Heading`); ids feed the OutlinePlugin.
- The `markdown ↔ HTML` regex pipeline (`convertMarkdownToHtml`/`convertHtmlToMarkdown`) is replaced by an `mdast` (remark) ↔ PM bridge in `NotebookSerializer` (out of scope for this schema doc, but the schema is designed so that bridge is straightforward: every mdast node has a 1:1 PM node).

---

### 2.5 `codeCell` (executable code body)

```ts
codeCell: {
  content: "codeText outputBlock?",       // editable code, then optional read-only outputs
  group: "cellBody",
  attrs: {
    language:      { default: "python" },
    executionCount:{ default: null },     // Jupyter In[n]/Out[n]
    displayMode:   { default: "complete" }, // 'complete' | 'codeOnly' | 'outputOnly'  (SINGLE source)
    lastExecutedAt:{ default: null },
    generating:    { default: false },    // durable "a gen task is filling me" flag
  },
  isolating: true,                        // protect code text from outside merges/backspace bleed
  toDOM: n => ["div", {
    class: "nb-code",
    "data-type": "code",
    "data-language": n.attrs.language,
    "data-display-mode": n.attrs.displayMode,
  }, 0],
  parseDOM: [{ tag: "div[data-type=code]", getAttrs: dom => ({
    language: dom.getAttribute("data-language") || "python",
    displayMode: dom.getAttribute("data-display-mode") || "complete",
  }) }],
}
```

```ts
// child: the editable code text
codeText: {
  content: "text*",
  marks: "",                              // no marks in code
  code: true,
  defining: true,
  toDOM: () => ["pre", { class: "nb-code-src" }, ["code", 0]],
  parseDOM: [{ tag: "pre.nb-code-src", preserveWhitespace: "full" }],
}
```

**Why `codeText` as a real child instead of `code` in an attr:**
The audit's biggest code-cell finding is that `code` lives as `node.attrs.code` (`data-code` JSON) and is actually edited inside a **CodeMirror** NodeView that reads/writes Zustand, with PM attrs as a dead "serialization mirror." Two viable models:

- **(A) PM-owned text (this spec, default):** `codeText` holds the source as real PM text. CodeMirror becomes a NodeView over `codeText` (à la `prosemirror-codemirror` integrations) whose changes dispatch PM transactions. Source survives in the doc, undo is native, search works.
- **(B) NodeView-owned buffer:** keep CodeMirror authoritative but sync its buffer to PM via transactions (not to Zustand). `codeText` becomes a leaf and the buffer is mirrored on each edit.

We specify **(A)** as canonical because it makes the document genuinely self-describing and lossless; **(B)** is an allowed fallback if CodeMirror↔PM text-node integration proves too costly during migration. **Either way, the source of truth is the PM doc, not Zustand.**

**Execution metadata & display mode:**
- `executionCount`, `language`, `lastExecutedAt`, `displayMode` are **durable node attrs**. `displayMode` becomes the *single* home for COMPLETE/CODE_ONLY/OUTPUT_ONLY, killing the current dual-storage divergence (`codeStore.cellModes` vs `metadata.displayMode`).
- **Ephemeral exec state stays out of the doc:** `isExecuting` / `elapsedTime` / `isCancelling` live in an `ExecutionPlugin` state map keyed by `cellId`, rendered as decorations on the `codeCell`. Rationale (from audit): the 1s polling loop and ticking `elapsedTime` would spam transactions and pollute undo. Output write-backs from execution are dispatched with `tr.setMeta('addToHistory', false)`.
- **Execution is an injected service, not a static singleton.** A `codeCell` node command `executeCell(cellId)` calls `ctx.services.execute(code, ctx)`. This decouples the schema from `CodeExecutionService`'s global-fetch/single-kernel assumptions and unifies the two current paths (`codeStore.executeCell` interactive vs `useScriptStore.execCodeCell` workflow).

---

### 2.6 `outputBlock` (read-only execution results)

```ts
outputBlock: {
  // child of codeCell only
  atom: true,
  selectable: false,
  isolating: true,
  attrs: {
    status: { default: "empty" },         // 'ok' | 'error' | 'empty'  (replaces sentinels)
    items:  { default: [] },              // [{ kind, data, mime?, key }]
    executionCount: { default: null },
  },
  toDOM: n => ["div", {
    class: "nb-output",
    "data-type": "output",
    "data-status": n.attrs.status,
    contenteditable: "false",
  }],                                       // no hole — atom; React NodeView renders items
  parseDOM: [{ tag: "div[data-type=output]", getAttrs: dom => ({
    status: dom.getAttribute("data-status") || "empty",
    items: safeParse(dom.getAttribute("data-items")) ?? [],
  }) }],
}
```

- **Schema-enforced read-only:** `atom:true`, `selectable:false`, `contenteditable:false`. The current "outputs are editable text the user can clobber" risk is gone; the audit's requirement that outputs be a "read-only, non-editable region of the codeCell node" is satisfied structurally.
- **Structured `items` instead of stringified blob + sentinels.** Each item:
  `{ kind: 'text'|'error'|'html'|'image'|'mime', data: string, mime?: string, key: string }`.
  This **replaces the in-band sentinel protocol** (`outputs[0] === '[error-message-for-debug]'` / `'[without-output]'`) with an explicit `status` attr. `showAIdebug` becomes `status === 'error'`; "no output" becomes `status === 'empty'`.
- **Renderer contract preserved:** `kind:'text'|'error'` → `ansi_to_html` in `<pre>`; `kind:'html'` → `dangerouslySetInnerHTML`; `kind:'image'` → `<img src>`. Existing `OutputRenderers.tsx` is reused as a pure presentational consumer of `node.attrs.items` (no store reads). The optional `mime` field leaves room for true Jupyter MIME bundles without breaking the string contract.
- **Write path:** execution results and streamed partials are applied by the `ExecutionPlugin` as `setNodeMarkup` on the `outputBlock` (or insert it if absent), always with `addToHistory:false`. The old `updateCellOutputsHelper` sentinel-prepend logic is deleted.
- **`outputBlock?` is optional:** a never-run code cell has no `outputBlock`; first execution inserts one.

---

### 2.7 `table` (GFM table)

```ts
table:       { content: "tableRow+", tableRole: "table", isolating: true, group: "cellBody",
               attrs: { align: { default: [] } } },          // column alignments :--- ---: :--:
tableRow:    { content: "(tableHeader | tableCell)*", tableRole: "row" },
tableHeader: { content: "block+", tableRole: "header_cell", isolating: true,
               attrs: { colspan:{default:1}, rowspan:{default:1}, colwidth:{default:null} } },
tableCell:   { content: "block+", tableRole: "cell", isolating: true,
               attrs: { colspan:{default:1}, rowspan:{default:1}, colwidth:{default:null} } },
```

- Use the **official `prosemirror-tables`** family (already wired today via `Table/TableRow/TableHeader/TableCell` + `SimpleTableExtension`). This gives reliable selection, column resize, and cell merging — far more robust than the current regex `convertMarkdownTableToHtml`/`convertTableToMarkdown`.
- **Alignment is preserved** in the `table.align` attr (one entry per column). The audit notes alignment is currently detected (`:---:`) but **dropped on output** (always `---`); the AST round-trip via `remark-gfm` now keeps it.
- `table` is listed as a `notebookCell` body (a table is its own cell, matching today's outline granularity). Tables *inside* `markdownBlock` are intentionally **not** allowed in v2 to keep one-cell-one-table simple; revisit if nested tables are needed.

---

### 2.8 `imageBlock`

```ts
imageBlock: {
  atom: true,
  group: "cellBody",
  draggable: true,
  attrs: {
    src:    { default: null },
    alt:    { default: "" },
    title:  { default: null },
    width:  { default: null },
    source: { default: "upload" },        // 'upload' | 'generated'
    generationParams: { default: null },  // structured attr (was URI-encoded JSON in data-*)
    isGenerating: { default: false },     // durable; gen-completion via metadata stream resolves by cellId
  },
  toDOM: n => ["div", { class: "nb-image", "data-type": "image", "data-source": n.attrs.source },
                ["img", { src: n.attrs.src, alt: n.attrs.alt, width: n.attrs.width }]],
  parseDOM: [{ tag: "div[data-type=image]", getAttrs: dom => {
    const img = dom.querySelector("img");
    return { src: img?.getAttribute("src"), alt: img?.getAttribute("alt") || "",
             source: dom.getAttribute("data-source") || "upload" }; } }],
}
```

- `generationParams` becomes a **real structured attr** instead of URI-encoded JSON in `data-generationParams` (audit flags the encoding as fragile/double-encoding-prone).
- **Upload & generation are injected services**, not store reads. The current `ImageView` pulls `{cells, updateCell, viewMode}` from `useStore` and runs upload/gen inline; in the new model the NodeView receives `ctx.services.uploadImage` / `ctx.services.generateImage` and dispatches a `setNodeMarkup` transaction with the result `src`. `UploadDropExtension` becomes a PM plugin that calls the same injected service.
- There is also an inline `inlineImage` node (group `inline`) for images embedded *within* `markdownBlock` prose; `imageBlock` is the block-level / standalone-cell image.

---

### 2.9 `thinkingBlock`

```ts
thinkingBlock: {
  atom: true,
  group: "cellBody",
  attrs: {
    cellId:   { default: null },          // mirrors parent for stream targeting convenience
    agentName:{ default: null },
    phase:    { default: "thinking" },    // 'thinking' | 'streaming' | 'done'
    text:     { default: "" },            // accumulated streamed text (DURABLE now)
    textArray:{ default: [] },            // structured streamed chunks if needed
  },
  selectable: true,
  toDOM: n => ["div", { class: "nb-thinking", "data-type": "thinking",
                        "data-agent": n.attrs.agentName, "data-phase": n.attrs.phase }],
  parseDOM: [{ tag: "div[data-type=thinking]", getAttrs: dom => ({
    agentName: dom.getAttribute("data-agent"),
    phase: dom.getAttribute("data-phase") || "thinking",
  }) }],
}
```

- **This is the biggest behavioral *fix*.** Audit: thinking cells today carry `content:''` in both converters, and `agentName`/`textArray`/`customText` are written to HTML attrs but **discarded on the way back** (commented out in the fallback) — i.e. *non-round-trippable*. The new spec makes `text`/`textArray`/`agentName`/`phase` **durable attrs** so the thinking state survives save/load and export.
- **Streaming maps to attr updates, not Zustand.** AI streaming appends to `thinkingBlock.text` via `setNodeMarkup` transactions (with `addToHistory:false`). The current `addNewContent2CurrentCell`/`tiptap_update` whole-string read-modify-write becomes targeted attr/text updates resolved by `cellId`.
- **Markdown representation:** thinking blocks have no native markdown. The serializer emits a `remark-directive` fenced container (`:::thinking{agent="..."} ... :::`) so export is lossless instead of dropping the cell (today export loses thinking cells entirely).
- A thinking cell that converts to a code cell (`convert_to_code_cell`) becomes a `ReplaceWith(notebookCell>codeCell)` transaction preserving `cellId`.

---

### 2.10 `rawBlock`

```ts
rawBlock: {
  content: "text*",
  marks: "",
  code: true,
  group: "cellBody",
  defining: true,
  attrs: { format: { default: "markdown" } }, // 'markdown' | 'html' | 'text'
  toDOM: n => ["div", { class: "nb-raw", "data-type": "raw", "data-format": n.attrs.format },
                ["pre", 0]],
  parseDOM: [{ tag: "div[data-type=raw]", preserveWhitespace: "full", getAttrs: dom => ({
    format: dom.getAttribute("data-format") || "markdown",
  }) }],
}
```

- Verbatim pass-through cell. Content is real PM text (not an attr), `defining` + `isolating` so its whitespace is preserved and it doesn't merge with neighbors.
- Serializer emits the raw text untouched (and, for `format:'markdown'`, can optionally be re-parsed on a later pass — but by default raw means raw).

---

## 3. Marks (full list)

```ts
marks: {
  strong: { parseDOM: [{tag:"strong"},{tag:"b"},{style:"font-weight=bold"}], toDOM:()=>["strong",0] },
  em:     { parseDOM: [{tag:"em"},{tag:"i"},{style:"font-style=italic"}],    toDOM:()=>["em",0] },
  code:   { parseDOM: [{tag:"code"}], toDOM:()=>["code",0], excludes:"_" },
  strike: { parseDOM: [{tag:"s"},{tag:"del"}], toDOM:()=>["s",0] },
  link:   {
    attrs: { href:{}, title:{default:null}, kind:{default:"url"} }, // 'url' | 'file' | 'wiki'
    inclusive: false,
    parseDOM: [{ tag:"a[href]", getAttrs: dom => ({
      href: dom.getAttribute("href"),
      kind: dom.getAttribute("href")?.startsWith("file://") ? "file"
          : dom.dataset.wikilink ? "wiki" : "url",
    }) }],
    toDOM: m => ["a", { href: m.attrs.href, "data-wikilink": m.attrs.kind==="wiki" || null }, 0],
  },
}
```

- Preserves the live `Link` (`file://` protocol) and `WikiLinkInput` behavior, but as a single `link` mark with a `kind` discriminator instead of a separate ad-hoc input-rule extension.

---

## 4. Mapping: Today's Cell Types → New Nodes

| Today (`CellType`) | Storage today | New node | Body content | Notes |
|---|---|---|---|---|
| `markdown` | `content: string` (markdown) | `notebookCell > markdownBlock` | native `block+` rich text | Inversion: string → PM content. Headings feed OutlinePlugin. |
| `code` | `content: string` + `outputs[]` + `data-code`/`data-outputs` attrs | `notebookCell > codeCell > (codeText, outputBlock?)` | code as `codeText`; results as `outputBlock` | Source PM-owned (model A); CodeMirror is a NodeView. Sentinels → `status`. |
| `hybrid` | code + rendered markdown in one cell | **two cells** OR `markdownBlock` followed by `codeCell` | — | See §6. Hybrid has no clean single-node form. |
| `image` | `content` (url) + `generationParams` (URI-JSON attr) | `notebookCell > imageBlock` (or inline `inlineImage`) | atom | `generationParams` → structured attr; upload/gen → injected service. |
| `thinking` | ephemeral, non-round-trippable attrs | `notebookCell > thinkingBlock` | atom, **durable** `text`/`agentName`/`phase` | Now persists & exports (was lost). |
| `raw` | `content: string` | `notebookCell > rawBlock` | PM text | Format attr added. |
| `link` | `content` link cell | `markdownBlock` paragraph with `link` mark, **or** `imageBlock`-style card | inline `link` mark | A whole-cell "link card" maps to a `markdownBlock` w/ a single linked paragraph; no dedicated `linkBlock` node in v2 (see §6). |
| *(title)* default H1 `metadata.isDefaultTitle` | special-cased `cells[0]` | `titleBlock` | `inline*` | Now a schema invariant; localization via decoration. |
| GFM table (inside a markdown cell's string) | regex-parsed substring | `notebookCell > table` | `prosemirror-tables` | Alignment preserved via AST round-trip. |

**Outline (Task/Phase/Step):** today derived by `parseMarkdownCells` regex on H1/H2/H3 and re-stamped onto every cell's `phaseId` on every mutation. New model: a read-only **OutlinePlugin** walks `titleBlock` + `markdownBlock` headings, builds the Task→Phase→Step tree as derived plugin state, and exposes `phaseId` per cell via decoration. No per-mutation array rebuild; no `phaseId` write-back into stored cells.

**Outputs / execution state:** durable `outputs` → `outputBlock.items`; `executionCount`/`language`/`displayMode` → `codeCell` attrs; ephemeral `isExecuting`/`elapsedTime` → `ExecutionPlugin` state keyed by `cellId`.

**Persistence:** `NotebookSnapshot {cells, tasks}` is replaced by serialized **PM JSON** (+ derived `tasks` recomputable on load). `NotebookSerializer.legacySnapshotToDoc()` provides back-compat reading of existing IndexedDB notebooks (the audit's required back-compat reader).

---

## 5. Plugins implied by the schema (not nodes, but part of the contract)

| Plugin | Responsibility | Replaces |
|---|---|---|
| `CellIdentityPlugin` (`appendTransaction`) | Assign/repair unique `cellId` on every `notebookCell` (split/paste/insert). | uuid scattered in extensions; generation-tracker fragility. |
| `OutlinePlugin` | Derive Task/Phase/Step tree + per-cell `phaseId` from headings; expose as plugin state/decorations. | `parseMarkdownCells` + `updateCellsPhaseId` re-stamping. |
| `ExecutionPlugin` | Hold ephemeral exec state keyed by `cellId`; apply output write-backs with `addToHistory:false`; render running/elapsed decorations. | `codeStore.cellExecStates` + `updateCellOutputs` polling writes. |
| `TitlePlaceholderPlugin` | Render localized default-title placeholder as decoration. | i18n default-title doc mutation in `useEditorEvents`. |
| `ExternalSyncPlugin` | Tag transactions with `meta.fromExternal`; the `dispatchTransaction` interceptor suppresses echo. | the wall-clock `isInternalUpdate` lock (`setTimeout` windows). |

---

## 6. Where current behavior does NOT fit cleanly

These are the deliberate friction points the schema **cannot** silently absorb; each needs a product/migration decision.

1. **`hybrid` cells.** A hybrid cell is "code + rendered markdown in one unit," reusing `Cells/HybridCell`. There is no clean single node: code wants `codeText` (no marks, `code:true`), prose wants `markdownBlock` (rich, marked). **Recommendation:** decompose each hybrid into an adjacent `markdownBlock` cell + `codeCell` cell during legacy import (`legacySnapshotToDoc`), preserving order and minting a second `cellId`. If product requires a *visually-unified* hybrid, model it as `notebookCell` allowing `content: "markdownBlock codeCell"` (a 2-child exception) — but this complicates outline granularity and drag, so it is **not** in the base content expression.

2. **`link` cells as first-class cells.** Today `link` is its own `CellType` with a dedicated `LinkCell` renderer. In the schema, a link is a *mark*, not a block. A standalone "link card" cell has no natural node. **Recommendation:** map to `markdownBlock` containing one linked paragraph (lossless for content), and render the "card" affordance via NodeView/decoration based on a `metadata.kind = 'linkCard'` on the wrapping `notebookCell`. A dedicated `linkBlock` atom can be added later if the card is a distinct product surface.

3. **`hybrid`/`thinking` ↔ markdown export.** `codeCell` exports as fenced code; `imageBlock` as `![]()`; `table` via GFM. But `thinkingBlock`, `rawBlock(format:'html')`, generation params, and code **outputs** have **no native markdown.** We rely on `remark-directive` containers (`:::thinking`, `:::output`) and frontmatter to round-trip them. Plain-Markdown consumers (GitHub, etc.) will see directive syntax, not rendered cells. **Decision needed:** accept directive-flavored markdown as the canonical export, or provide a "lossy plain MD" export that drops these (today's behavior).

4. **Code source ownership (model A vs B).** Spec §2.5 prefers PM-owned `codeText` with CodeMirror as a NodeView. If `prosemirror`↔`CodeMirror` text-node sync proves too costly, fallback model B keeps CodeMirror authoritative with a mirrored buffer. The schema supports both (`codeText` as text-content vs leaf), but **the choice affects search, undo granularity, and collab**, and must be made before serializer work.

5. **Rich (MIME-bundle) outputs.** `outputBlock.items[].data` is a string today; structured Jupyter MIME bundles are flattened. The schema adds an optional `mime` field and a `kind:'mime'` to grow into rich outputs, but **current renderers still assume strings.** Adopting rich outputs is an additive, post-migration step — flagged so the `items` shape doesn't get re-baked later.

6. **AI prose answers (QA sidebar).** `addContentToAnswer` → `AIAgentStore.qaList` → right-sidebar is **outside** the document and intentionally **not** modeled as a node. The schema does not cover it; migration scope must explicitly **exclude** QA streaming to avoid conflating it with `thinkingBlock`/cell streaming.

7. **Ephemeral exec state vs serialization.** `elapsedTime`/`isExecuting` must *never* serialize. Because they live in `ExecutionPlugin` (not attrs), the schema is clean — but any tooling that snapshots "the whole editor state" must snapshot the **doc only**, not plugin state. This is a contract footnote for the persistence adapter.

8. **`fsmState` / `ExtensionFSM`.** The audit's `fsmState` attr on every node has **no live consumer** (vestigial). It is **deliberately omitted** from this schema. If a real per-cell lifecycle FSM is ever wanted, it belongs in `ExecutionPlugin`/`notebookCell.metadata`, not as a universal node attr.

---

## 7. Summary of the contract

- **Top:** `notebook → titleBlock notebookCell+`.
- **Cell wrapper** `notebookCell` carries identity (`cellId`) + cross-cutting attrs; wraps exactly one body.
- **Bodies:** `markdownBlock` (rich PM text + marks), `codeCell` (`codeText` + optional `outputBlock`), `imageBlock` (atom), `thinkingBlock` (atom, now durable), `rawBlock` (verbatim text), `table` (GFM via `prosemirror-tables`).
- **Outputs** are a read-only `atom` child with structured `items` + explicit `status` (sentinels gone).
- **Execution metadata** is durable on `codeCell`/`outputBlock`; **runtime state** is ephemeral plugin state keyed by `cellId`.
- **Outline, identity, title placeholder, external-sync echo control** are plugins, not schema noise.
- **Marks** confined to text bodies; `link` unified with `kind` discriminator.
- The schema is the single artifact the serializer, command registry, executor service, and React shell all bind to — enabling the PM doc (not Zustand) to be the source of truth.