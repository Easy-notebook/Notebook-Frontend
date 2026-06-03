I'll write the design document directly. This is a documentation task based on the provided audit, so I'll produce the markdown without needing to explore the codebase further (the audit is comprehensive).

# MARKDOWN Round-Trip & TABLE Model — Design Document

> Part of the `@easynotebook` SDK refactor. This document specifies (1) the canonical ProseMirror-first document model, (2) a **real AST** Markdown round-trip built on `remark`/`unified` + `mdast` (replacing all regex/DOM-walk conversion), and (3) the `prosemirror-tables`-based table model with Markdown tables as an **import/export serialization format only**.

---

## 1. Context & Goals

### 1.1 What exists today (from audit)

The current TipTap editor has **no real Markdown AST anywhere in the authoritative round-trip**. The pipeline is:

```
Zustand cells[]  --convertCellsToHtml-->  HTML string  --setContent-->  PM doc
PM doc  --doc.toJSON()-->  convertEditorStateToCells (extractTextFromNode)  -->  cells[]
```

The lossy "heart" is `src/components/Editor/utils/markdownConverters.ts` (498 LOC) and `src/components/Editor/utils/cellConverters.ts` (774 LOC):

- `convertMarkdownToHtml` — **line-by-line regex** for `**bold**`/`*italic*`/`` `code` ``/lists/quotes/`#` headings; tables detected with two regexes; LaTeX/images extracted into placeholder tokens; **no HTML escaping** (raw text → innerHTML strings).
- `convertHtmlToMarkdown` — DOMParser tree-walk back to Markdown; a **second** table serializer duplicating `convertTableToMarkdown`.
- `extractTextFromNode` — a PM-JSON→Markdown serializer that handles **only** bold/italic/code marks, blockquote, bullet/ordered lists, hardBreak, `latexBlock`, `markdownImage`. Any new mark is **silently dropped**.
- The only genuine Markdown lexer in the whole repo is `marked.lexer` in `exportToPDF.ts`, and `react-markdown`/`remark` inside the (parallel, non-round-trip) `MarkdownCell.tsx` renderer.

Known correctness failures documented in the audit:

| Feature | Current behavior | Result |
|---|---|---|
| Fenced code inside a markdown cell | never parsed (code is a separate cell type) | ` ```python ` block corrupted on round-trip |
| YAML frontmatter | export-only; no import path parses it | re-import treats `---` as thematic break |
| Inline vs block math | whole-line heuristic; lone-line `$...$` → display | inline formula round-trips as block |
| GFM table alignment (`:---:`) | detected, then dropped (always emits `---`) | alignment lost |
| Table cells with `\|` or pipe-in-code | naive split on `\|` | parsing breaks |
| `<`, `&`, quotes in text | no escaping | malformed HTML, silent loss |
| Custom blocks (thinking/raw/code/attachment) | no markdown representation | lost entirely on export |
| Heading levels | re-leveled via `titleStack`; each heading split into its own cell | nesting intent not preserved |

### 1.2 Target goals

1. **Real AST round-trip** — `markdown ⇄ PM doc ⇄ markdown` via `unified`/`remark`/`mdast`, never regex. One canonical codec; the four overlapping conversion paths collapse into one.
2. **PM doc is the source of truth** — Markdown is just *one serialization format* (alongside PM JSON for persistence and `{cells, tasks}` for legacy interop). `cells[]` becomes a derived projection, not canonical.
3. **Reliable tables** — `prosemirror-tables` provides the in-editor model (table map, cell selection, row/column commands); Markdown GFM tables are an **import/export serializer only**, preserving alignment.
4. **Lossless custom blocks** — code fences, math, frontmatter, thinking/raw/image/attachment blocks each get a canonical PM node spec **and** a markdown (de)serializer (using `remark-directive` containers for blocks that have no native markdown syntax).
5. **Industrial SDK boundaries** — the codec is framework-free (no React, no Zustand, no `window`). It lives in the PM core (`NotebookSerializer`), consumed by `NotebookEditorCore` / `NotebookDoc`; React (`ControlledNotebookEditor`) is only a view adapter.

---

## 2. Architectural placement

```
@easynotebook/core (framework-free)
├── schema/                NotebookSchema (PM Schema)  ── §4 node specs
├── serializer/
│   ├── NotebookSerializer.ts        markdown ⇄ PM doc  (this doc, §5)
│   ├── mdast-to-pm.ts               mdast → PM doc
│   ├── pm-to-mdast.ts               PM doc → mdast
│   └── directives.ts                custom-block container handlers (§7)
├── adapter/
│   └── cellsCodec.ts                PM doc ⇄ legacy Cell[]  (interop only)
├── tables/                          prosemirror-tables wiring + commands (§9)
└── NotebookEditorCore.ts            owns EditorState/View, exposes serializer

@easynotebook/react (view adapter)
└── ControlledNotebookEditor.tsx     mounts core.view; no model logic
```

`NotebookSerializer` is the **only** module that knows Markdown. Nothing else regex-parses content. `NotebookDoc.toMarkdown()` / `NotebookDoc.fromMarkdown()` delegate to it. The legacy `markdownConverters.ts`, `cellConverters.ts` regex/DOM paths, `parseMarkdownContent`, and `extractTextFromNode` are **deleted** once this lands.

---

## 3. Dependencies (exact npm packages)

### 3.1 Markdown AST (unified / remark / mdast)

```jsonc
{
  "dependencies": {
    "unified": "^11.0.5",            // pipeline orchestrator
    "remark-parse": "^11.0.0",       // markdown text -> mdast
    "remark-stringify": "^11.0.0",   // mdast -> markdown text
    "remark-gfm": "^4.0.1",          // GFM: tables, strikethrough, task lists, autolinks
    "remark-math": "^6.0.0",         // $inline$ and $$block$$ math -> math/inlineMath nodes
    "remark-frontmatter": "^5.0.0",  // YAML/TOML frontmatter parsing (symmetric)
    "remark-directive": "^3.0.1",    // ::: containers for custom blocks (thinking/raw/etc.)
    "mdast-util-from-markdown": "^2.0.2",  // (transitive, pin for directive extensions)
    "mdast-util-to-markdown": "^2.1.2",    // (transitive, custom node serializers)
    "mdast-util-directive": "^3.0.0",      // directive node <-> mdast handlers
    "micromark-extension-directive": "^3.0.2",
    "unist-util-visit": "^5.0.0"     // tree walking helpers
  }
}
```

> **Note on versions:** all `remark`/`unified` v11+ packages are **ESM-only**. Ensure the build (Vite) and any Jest/Vitest config transpile them (Vitest handles ESM natively; for Jest add them to `transformIgnorePatterns` exceptions). Pin transitive `mdast-util-*` / `micromark-extension-*` to guarantee directive support is wired even if a top-level package bumps.

### 3.2 ProseMirror ⇄ mdast bridge

We do **not** use `prosemirror-markdown`'s default `MarkdownParser`/`MarkdownSerializer` directly, because (a) it uses its own `markdown-it` tokenizer (not remark, no GFM tables/math/directives without extra glue), and (b) we need custom nodes. Instead we write a thin **mdast ↔ PM** mapper (`mdast-to-pm.ts`, `pm-to-mdast.ts`) over the `prosemirror-model` API.

```jsonc
{
  "dependencies": {
    "prosemirror-model": "^1.24.1",
    "prosemirror-state": "^1.4.3",
    "prosemirror-view": "^1.37.0",
    "prosemirror-transform": "^1.10.2",
    "prosemirror-tables": "^1.6.4",      // table model + commands (§9)
    "prosemirror-keymap": "^1.2.2",
    "prosemirror-commands": "^1.6.2",
    "prosemirror-history": "^1.4.1",
    "prosemirror-inputrules": "^1.4.0",
    "prosemirror-gapcursor": "^1.3.2"    // cursor placement around atom/code/output nodes
  }
}
```

### 3.3 Test-only

```jsonc
{
  "devDependencies": {
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "prosemirror-test-builder": "^1.1.1"  // build PM docs declaratively in tests
  }
}
```

### 3.4 Dependencies to remove after migration

- `marked`, `@types/marked` — only used in `exportToPDF.ts`; **migrate PDF export to render from the PM doc / mdast**, then drop. (Keep temporarily if PDF rewrite is out of scope; do not let it back into the round-trip.)
- `turndown`, `@types/turndown` — audit found **imported but never instantiated**; remove now.
- `react-markdown` / `remark-gfm` / `remark-math` *as used inside `MarkdownCell.tsx`/`HybridCell.tsx`* — that parallel renderer is not the round-trip; either delete those cells (TipTap NodeViews supersede them) or keep `react-markdown` solely for read-only preview modes (demo/complete). Decide per §11.

---

## 4. PM node mapping (the canonical schema)

The document is a `notebook` node. Every former cell becomes a top-level block keyed by a **stable `cellId`** attribute. The schema below names the nodes proposed in the refactor (`notebook, notebookCell, markdownBlock, codeCell, outputBlock, table, imageBlock, thinkingBlock, rawBlock`).

| Concept | Markdown (mdast) source | PM node | Content model | Key attrs |
|---|---|---|---|---|
| Document | (root) | `notebook` | `frontmatter? notebookCell+` | `notebookId` |
| Title (first heading) | `heading[depth=1]` (first) | `markdownBlock` w/ `role:"title"` *(or dedicated `titleBlock`)* | inline | `cellId`, `level:1` |
| Prose / headings / lists / quotes | `paragraph`, `heading`, `list`, `blockquote`, `thematicBreak` | `markdownBlock` (rich text) | block+ (PM-native paragraph/heading/list/blockquote) | `cellId` |
| Fenced code (executable) | `code` (fenced, with `lang`/`meta`) | `codeCell` + child `outputBlock` | `code_text` (editable) ; `outputBlock` (atom) | `cellId`, `language`, `enableEdit`, `displayMode` |
| Inline math | `inlineMath` | `mathInline` (inline leaf) | — | `tex` |
| Block math | `math` | `mathBlock` (block leaf) | — | `tex` |
| Image | `image` / `:::image` | `imageBlock` | atom | `cellId`, `src`, `alt`, `title`, `generationParams?` |
| Table | `table` (GFM) | `table` (prosemirror-tables) | `tableRow+` | `align[]` per column (§9) |
| Thinking | `:::thinking` directive | `thinkingBlock` | text / inline | `cellId`, `agentName`, `state`, `textArray` |
| Raw passthrough | `:::raw` directive (or `html` node) | `rawBlock` | text (verbatim) | `cellId`, `format` |
| File attachment | `:::attachment` directive | `attachmentBlock` *(atom)* | atom | `cellId`, `fileId`, `name`, `mime`, `size` |
| Frontmatter | `yaml` (remark-frontmatter) | `notebook` attr `frontmatter` (or hidden `frontmatterBlock`) | — | parsed object |

### 4.1 `codeCell` + `outputBlock` (executable cells)

Per the execution audit, outputs must be a **read-only schema-enforced region**, and execution runtime state (isExecuting/elapsedTime) must **not** be node attrs (too fast → pollutes history). So:

```ts
// codeCell: editable code text lives in PM content (not a JSON attr)
const codeCell: NodeSpec = {
  group: "block",
  content: "code_text outputBlock?",   // code is real PM text; output is an atom child
  attrs: {
    cellId:      { default: null },
    language:    { default: "python" },
    enableEdit:  { default: true },
    displayMode: { default: "complete" },  // complete | code_only | output_only (single source of truth)
  },
  // marks: "",  defining: true,
};

const outputBlock: NodeSpec = {
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  attrs: {
    items:  { default: [] },     // [{ kind:'text'|'error'|'html'|'image', data:string, mime? }]
    status: { default: "empty" },// ok | error | empty  (replaces in-band sentinel markers)
    executionCount: { default: null },
  },
};
```

This **eliminates** the in-band sentinel strings `[error-message-for-debug]` / `[without-output]` (replaced by `outputBlock.status`) and the `data-code`/`data-outputs` URI-encoded JSON attrs.

> Outputs and partial-output writes are applied with `tr.setMeta('addToHistory', false)` so they never enter undo and never disturb the editing selection. Ephemeral exec state lives in a plugin keyed by `cellId`, surfaced via decorations — **not** serialized to Markdown.

### 4.2 Stable `cellId`

`cellId` is the join key across PM node ↔ legacy Cell ↔ generationTracker ↔ autosave. The serializer **preserves** `cellId` on round-trip by emitting it as directive metadata for custom blocks and, for plain markdown blocks, by **not** depending on it for content fidelity (IDs are regenerated deterministically on parse if absent; see §6.4). A plugin guarantees uniqueness across split/merge/paste.

---

## 5. Markdown ⇄ PM round-trip strategy

### 5.1 Pipelines

**Parse (markdown → PM doc):**

```
markdown string
  └─ unified()
       .use(remarkParse)
       .use(remarkFrontmatter, ['yaml'])
       .use(remarkGfm)
       .use(remarkMath)
       .use(remarkDirective)
     .parse()                       → mdast tree
  └─ mdastToPm(tree, schema)        → ProseMirror Node (notebook)
```

**Serialize (PM doc → markdown):**

```
ProseMirror Node (notebook)
  └─ pmToMdast(doc)                 → mdast tree
  └─ unified()
       .use(remarkStringify, { bullet:'-', fences:true, rule:'-', listItemIndent:'one' })
       .use(remarkFrontmatter, ['yaml'])
       .use(remarkGfm, { tablePipeAlign:true })
       .use(remarkMath)
       .use(remarkDirective)
     .stringify(tree)              → markdown string
```

### 5.2 `mdastToPm` mapping rules

Walk the mdast root children. Each top-level mdast node → a PM block (`notebookCell`-level):

- `yaml` → `notebook.attrs.frontmatter` (parsed once; symmetric on output).
- `heading`/`paragraph`/`list`/`blockquote`/`thematicBreak` → accumulate into a `markdownBlock` (PM-native rich text; **headings keep their depth as `heading.attrs.level`**, no re-leveling, no `titleStack`).
- `code` (fenced) → `codeCell` with `language = node.lang`, code text = `node.value` as a PM text node, empty `outputBlock`. (Outputs are **not** in markdown; re-hydrated from PM JSON / store on load.)
- `math` → `mathBlock { tex: node.value }`; `inlineMath` → `mathInline`.
- `image` (or `:::image`) → `imageBlock`.
- `table` → PM `table` via the table builder (§9.3), reading `node.align` → per-column alignment.
- `containerDirective` named `thinking`/`raw`/`attachment` → respective custom node (§7).
- Unknown `html` nodes → `rawBlock { format:'html' }` (verbatim, escaped on display).

Inline mdast (`strong`/`emphasis`/`inlineCode`/`delete`/`link`/`break`/`inlineMath`/`image`) → PM marks/inline leaves. **All inline mapping is mark-complete**, fixing the "new mark silently dropped" defect by failing loudly in dev when an mdast inline type has no handler.

### 5.3 `pmToMdast` mapping rules

The inverse. Notably:

- `markdownBlock` children → corresponding mdast nodes.
- `codeCell` → mdast `code` with `lang`. **`outputBlock` is skipped** (outputs are not markdown). `cellId`/`displayMode` are emitted only when exporting to the *PM-JSON* / *cells* formats, never to markdown (markdown stays clean and portable).
- `table` → mdast `table` with `align[]` reconstructed from column alignment (§9.4).
- custom nodes → `containerDirective` with attributes (§7).
- **Escaping is centralized in `remark-stringify`** — arbitrary user text can never produce malformed output (fixes the no-escaping defect).

### 5.4 Three serialization formats, one codec family

`NotebookSerializer` exposes:

```ts
interface NotebookSerializer {
  // portable, lossy-by-design (no outputs/exec state): for .md files, copy/paste
  toMarkdown(doc: PMNode): string;
  fromMarkdown(md: string): PMNode;

  // lossless canonical persistence: PM JSON (includes outputs, cellId, displayMode)
  toJSON(doc: PMNode): NotebookJSON;
  fromJSON(json: NotebookJSON): PMNode;

  // legacy interop only (Jupyter/JSON import-export, back-compat IndexedDB)
  toCells(doc: PMNode): Cell[];
  fromCells(cells: Cell[]): PMNode;
}
```

- **Persistence** uses `toJSON`/`fromJSON` (PM JSON is the new on-disk format; a back-compat reader imports the legacy `{cells, tasks}` snapshot via `fromCells`).
- **`.md` export/import** uses `toMarkdown`/`fromMarkdown` and is explicitly **portable & lossy** (outputs, exec state, generation params not embedded — matching what a `.md` file should be).
- **`toCells`/`fromCells`** is the single adapter that replaces `convertCellsToHtml`/`convertEditorStateToCells`; it exists only for Jupyter/JSON import-export and the Workflow agent write paths during migration.

---

## 6. Round-trip testing strategy

The round-trip is the highest-risk surface. We test it with **fixture-based property tests**, not example assertions only.

### 6.1 Invariants

For a normalized markdown fixture `M`:

1. **MD → PM → MD stability (idempotence after one normalization pass):**
   `serialize(parse(M)) === serialize(parse(serialize(parse(M))))`
   The first pass normalizes (e.g. `*` → `-` bullets); subsequent passes must be a **fixed point**.
2. **PM → MD → PM doc-equality:** `parse(serialize(D)).eq(D)` for any doc `D` the editor can produce (compare with `Node.eq`, ignoring volatile attrs like ephemeral exec state and regenerated `cellId`s via a normalizer).
3. **No silent drop:** every mdast inline/block type encountered in fixtures has a handler; an unhandled type throws in test mode.
4. **Escaping safety:** for adversarial inputs (`<script>`, `&`, `|`, `*`, backticks, `$`, `:::`), `parse(serialize(parse(M)))` is stable and produces no malformed structure.

### 6.2 Fixture layout

```
core/serializer/__fixtures__/
  prose/            headings, nested lists, ordered lists, task lists, blockquotes
  inline/           bold, italic, strike, code, links, autolinks, hardbreaks
  code-fences/      python/js, with meta, nested fences-in-text
  math/             inline $x$, block $$..$$, mixed, edge ($ alone, multi-$)
  tables/           left/center/right/default align, pipe-in-code, escaped \|, ragged rows
  frontmatter/      yaml present/absent, multiline values
  custom/           thinking, raw-html, attachment, image-with-params
  adversarial/      html injection, unbalanced markers, unicode, very-wide tables
```

Each fixture is a `.md` file; some pair with an expected `.json` (PM doc snapshot) for direction-2 checks.

### 6.3 Test harness (Vitest)

```ts
import { describe, it, expect } from "vitest";
import fg from "fast-glob";
import fs from "node:fs";
import { fromMarkdown, toMarkdown } from "../NotebookSerializer";

describe("markdown round-trip", () => {
  for (const file of fg.sync("core/serializer/__fixtures__/**/*.md")) {
    const md = fs.readFileSync(file, "utf8");
    it(`is a fixed point: ${file}`, () => {
      const once = toMarkdown(fromMarkdown(md));
      const twice = toMarkdown(fromMarkdown(once));
      expect(twice).toBe(once);                 // invariant 1
    });
    it(`doc round-trips: ${file}`, () => {
      const doc = fromMarkdown(md);
      const doc2 = fromMarkdown(toMarkdown(doc));
      expect(normalize(doc2).eq(normalize(doc))).toBe(true); // invariant 2
    });
  }
});
```

`normalize(doc)` strips/canonicalizes `cellId` and ephemeral attrs before `Node.eq`. Use `prosemirror-test-builder` for hand-authored direction-2 docs (e.g. a table with center alignment, a thinking block with `agentName`).

### 6.4 Determinism

`cellId` regeneration on parse uses a deterministic hash of (node type + ordinal path) when absent, so repeated parses of the same markdown yield identical IDs and round-trip tests are stable. Custom blocks **persist** their `cellId` via directive attributes, so a `:::thinking` block keeps identity across a `.md` save/load.

---

## 7. Custom blocks via `remark-directive`

Blocks with no native Markdown syntax (thinking, raw, attachment, image-with-metadata) use **container directives** so they remain valid, human-readable Markdown and survive third-party Markdown tools as visible fenced containers.

### 7.1 Syntax

```markdown
:::thinking{agent="planner" state="done"}
Considering whether to split the dataset...
:::

:::raw{format="html"}
<iframe src="https://example.com"></iframe>
:::

:::attachment{fileId="f_123" name="data.csv" mime="text/csv" size="20480"}
:::
```

`image` with generation params:

```markdown
:::image{src="blob:..." alt="chart" gen="model=dalle&seed=42"}
:::
```

(Plain images without params still serialize as native `![alt](src)`.)

### 7.2 mdast ↔ PM for directives

`remark-directive` produces `containerDirective` nodes with `.name` and `.attributes`. `mdast-to-pm.ts` switches on `.name`:

```ts
function directiveToPm(node, schema) {
  switch (node.name) {
    case "thinking":
      return schema.nodes.thinkingBlock.create({
        cellId: node.attributes.cellId ?? genId(),
        agentName: node.attributes.agent,
        state: node.attributes.state ?? "idle",
      }, parseInline(node.children, schema));
    case "raw":
      return schema.nodes.rawBlock.create(
        { format: node.attributes.format ?? "text" },
        schema.text(toString(node)),
      );
    case "attachment":
      return schema.nodes.attachmentBlock.create({ ...node.attributes });
    default:
      // unknown directive -> rawBlock verbatim (never lose content)
      return schema.nodes.rawBlock.create({ format: "markdown" }, schema.text(stringifyDirective(node)));
  }
}
```

`pm-to-mdast.ts` does the inverse, emitting `containerDirective` with attributes. This **fixes** the audit's "thinking cells are non-round-trippable" and "custom blocks lost on export" defects: thinking text, agent name, raw HTML, and attachment metadata all survive a `.md` save/load.

> Outputs and live execution state are still **not** put in markdown (they belong to PM JSON persistence). A thinking block's transient `textArray` streaming buffer is serialized as its settled text content only.

---

## 8. Frontmatter (symmetric)

- Parse: `remark-frontmatter(['yaml'])` yields a `yaml` node; we parse it with a small YAML reader into `notebook.attrs.frontmatter`.
- Serialize: emit the same `yaml` node first, so export → import is **symmetric** (fixes the current write-only/asymmetric frontmatter defect where `---` re-imported as a thematic break).
- Frontmatter is **not** rendered as an editable block by default; it is editor metadata surfaced in a side panel. (Optionally expose a read-only `frontmatterBlock` for power users.)

---

## 9. Table model (`prosemirror-tables`)

Tables are where the current regex approach fails hardest (alignment dropped, `\|` breaks parsing, two duplicate serializers). The fix: **`prosemirror-tables` owns the in-editor model; Markdown GFM tables are only a serialization format at the import/export boundary.**

### 9.1 Schema

Use `prosemirror-tables`' `tableNodes` helper to generate `table`, `table_row`, `table_cell`, `table_header` specs, then add a per-column **alignment** attr we control:

```ts
import { tableNodes } from "prosemirror-tables";

const tNodes = tableNodes({
  tableGroup: "block",
  cellContent: "block+",            // cells hold rich PM content (paragraphs, inline marks, even code)
  cellAttributes: {
    align: {                        // 'left' | 'center' | 'right' | null
      default: null,
      getFromDOM: (dom) => dom.style.textAlign || null,
      setDOMAttr: (v, attrs) => v && (attrs.style = `text-align:${v}`),
    },
  },
});
```

> GFM alignment is **per-column**. We store it as a per-cell `align` attr but **enforce column-uniform alignment** in the serializer (derive a column's alignment from its header cell). This keeps `prosemirror-tables`' cell-level model while round-tripping GFM's column-level `:---:` faithfully.

### 9.2 Plugins, commands, behavior

Wire the standard table stack into `NotebookEditorCore`:

```ts
import {
  tableEditing, columnResizing, goToNextCell,
  addColumnBefore, addColumnAfter, deleteColumn,
  addRowBefore, addRowAfter, deleteRow,
  mergeCells, splitCell, deleteTable,
  setCellAttr, CellSelection,
} from "prosemirror-tables";

plugins.push(columnResizing(), tableEditing());

keymap({
  "Tab": goToNextCell(1),
  "Shift-Tab": goToNextCell(-1),
});
```

This gives us, for free and correctly:

- **Table map** — `prosemirror-tables` maintains a `TableMap` (cell positions, colspan/rowspan, width) so row/column ops are correct even with merged cells.
- **Cell selection** — `CellSelection` enables rectangular multi-cell selection (drag across cells), required for merge/split and column alignment commands.
- **Row/column commands** — `addRowBefore/After`, `deleteRow`, `addColumnBefore/After`, `deleteColumn`, `mergeCells`, `splitCell`, `deleteTable`. These are exposed through the **injectable command registry** as `table.insertRowAbove`, `table.deleteColumn`, etc., so slash/toolbar/keyboard all consume one definition (matching the command-system goal). Alignment commands wrap `setCellAttr('align', 'center')` applied across the current `CellSelection` column.
- **Column resizing** — `columnResizing()` gives drag handles; widths persist as cell attrs (PM-native, not in markdown — GFM has no width).

### 9.3 Markdown table → PM (import)

In `mdast-to-pm.ts`, an mdast `table` node carries `align: ('left'|'right'|'center'|null)[]` (from `remark-gfm`) and rows of cells whose children are **already parsed inline mdast** (so `\|`, inline code with pipes, links, and math inside cells are handled by remark — **fixing** the naive `'|'`-split defect). We build:

```ts
function tableFromMdast(node, schema) {
  const align = node.align ?? [];
  const rows = node.children.map((row, r) =>
    schema.nodes.table_row.create(null,
      row.children.map((cell, c) => {
        const type = r === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
        return type.create(
          { align: align[c] ?? null },
          schema.nodes.paragraph.create(null, inlineFromMdast(cell.children, schema)),
        );
      }),
    ),
  );
  return schema.nodes.table.create(null, rows);
}
```

### 9.4 PM → Markdown table (export)

In `pm-to-mdast.ts`, walk the PM `table` via `TableMap` to flatten merged cells (GFM has **no** colspan/rowspan — we **expand/duplicate** merged content or emit a warning, since GFM cannot represent merges; document this as an intentional export limitation). Reconstruct `align[]` from each column's header cell `align` attr, and emit each cell's inline content back to mdast inline nodes. `remark-stringify` + `remark-gfm` then renders the pipe table **with alignment markers** (`:---`, `:---:`, `---:`) — fixing the "alignment always dropped" defect.

### 9.5 Round-trip guarantees & limits for tables

| Feature | Round-trips via markdown? | Notes |
|---|---|---|
| Column alignment (`:---:`) | ✅ | preserved both directions |
| Inline marks / links / code / math in cells | ✅ | remark parses cell inline content |
| Escaped pipes `\|`, pipes in inline code | ✅ | handled by remark, not naive split |
| Column widths (resize) | ❌ (PM-only) | GFM has no width; kept in PM JSON |
| Merged cells (colspan/rowspan) | ⚠️ flattened | GFM cannot represent; export expands content + warns |
| Cell-level (non-uniform) alignment | ⚠️ normalized to column | GFM is column-uniform |

In-editor (PM JSON persistence), **all** table features are preserved losslessly; only the **markdown export** is subject to GFM's expressiveness limits, which is the correct trade-off for a portable format.

---

## 10. Outline derivation (replacing `parseMarkdownCells`)

Today `notebookStore` calls `parseMarkdownCells` on nearly every mutation to rebuild the Task/Phase/Step tree by regex on heading prefixes, re-stamping `phaseId` onto cells. In the PM-first model:

- Headings are **real PM nodes** (`heading` inside `markdownBlock`).
- A **ProseMirror plugin** walks heading nodes and produces a derived outline (Task/Phase/Step) as plugin state + decorations — **no** re-stamping of stored cells, **no** regex, **no** per-mutation array rebuild.
- The outline sidebar subscribes to plugin state instead of recomputed store arrays.

This removes the entanglement between cell identity/order and heading structure flagged across multiple audit subsystems.

---

## 11. Migration plan (sequenced, low-risk first)

1. **Mechanical dead-code deletion** (no behavior change): remove `turndown`; delete the dead duplicate extensions, dead BlockManager variants, dead slash systems, and the regex converters' fallback paths once the codec exists. (Tracked separately, but unblocks a clean serializer surface.)
2. **Land `NotebookSerializer` behind a flag**, with the full fixture round-trip suite green (§6). It is pure and framework-free; can be unit-tested before any UI wiring.
3. **Switch persistence** to `toJSON`/`fromJSON` (PM JSON), with `fromCells` back-compat reader for existing IndexedDB `{cells, tasks}` snapshots.
4. **Switch `.md` import/export** (`exportToMarkdown`, `import4JsonOrJupyterNotebook`) to `toMarkdown`/`fromMarkdown`; delete `parseMarkdownContent` and `markdownConverters.ts`.
5. **Adopt `prosemirror-tables`** schema + commands; replace `convertMarkdownTableToHtml`/`convertTableToMarkdown` with §9.3/§9.4. Verify with the `tables/` fixtures.
6. **Invert the source of truth**: PM doc becomes canonical; `cells[]` becomes a derived `toCells` projection for interop/agent write paths. Delete `convertCellsToHtml`/`convertEditorStateToCells`/`extractTextFromNode` and the `useEditorSync`/`useEditorEvents` two-way HTML bridge (replaced by `core.applyExternalCells` / transaction-meta `fromExternal`).
7. **Move outline** to the PM plugin (§10); drop `parseMarkdownCells` from the store mutation path.
8. **Decide MarkdownCell renderer fate**: either delete `MarkdownCell.tsx`/`HybridCell.tsx`'s `react-markdown` path (TipTap NodeViews + PM rendering supersede it) or keep `react-markdown` **only** for read-only demo/complete view modes — never in the round-trip. Remove `marked` after PDF export is re-pointed at mdast.

**Acceptance gate:** the §6 round-trip suite (all fixture categories incl. adversarial) is green, and a golden corpus of existing user notebooks (loaded from IndexedDB via `fromCells`) round-trips through `toMarkdown`→`fromMarkdown` with `Node.eq` after normalization.

---

## 12. Summary of defects fixed

| Defect (audit) | Fix |
|---|---|
| No real AST; regex/DOM round-trip | `unified`/`remark`/`mdast` codec (§3, §5) |
| Marks silently dropped | mark-complete inline mapping that throws on unknown types in dev (§5.2) |
| No HTML escaping | escaping centralized in `remark-stringify` (§5.3) |
| Fenced code corrupted | `code` mdast node ↔ `codeCell` (§4.1, §5.2) |
| Frontmatter asymmetric | `remark-frontmatter` symmetric parse/serialize (§8) |
| Inline math → block | `remark-math` distinguishes `inlineMath`/`math` (§4, §5) |
| Table alignment dropped | per-column align reconstructed via `remark-gfm` (§9.4) |
| `\|`/pipe-in-code breaks tables | remark parses cell inline content (§9.3) |
| Custom/thinking/raw blocks lost on export | `remark-directive` containers, round-trippable (§7) |
| URI-encoded JSON in HTML attrs | PM node attrs + structured `outputBlock` (§4.1) |
| In-band output sentinels | `outputBlock.status` field (§4.1) |
| Per-mutation regex outline rebuild | PM heading plugin (§10) |
| Two duplicate table serializers + 4 overlapping conversion paths | one canonical mdast ↔ PM codec (§2, §5.4) |

---

Relevant source files this design replaces or inverts (all absolute):

- `/Users/silan/Documents/github/Notebook-Frontend/src/components/Editor/utils/markdownConverters.ts` — **delete** (regex MD↔HTML).
- `/Users/silan/Documents/github/Notebook-Frontend/src/components/Editor/utils/cellConverters.ts` — **replace** with `toCells`/`fromCells` adapter; delete `extractTextFromNode` + DOM fallback.
- `/Users/silan/Documents/github/Notebook-Frontend/src/components/Editor/utils/markdownParser.ts` and `/Users/silan/Documents/github/Notebook-Frontend/src/utils/markdownParser.ts` — **delete** (`parseMarkdownContent`) / **move** outline to PM plugin (`parseMarkdownCells`).
- `/Users/silan/Documents/github/Notebook-Frontend/src/utils/exportToFile/exportToMarkdown.ts` and `/Users/silan/Documents/github/Notebook-Frontend/src/utils/importFile/import4JsonOrJupyterNotebook.ts` — **re-point** to `NotebookSerializer`.
- `/Users/silan/Documents/github/Notebook-Frontend/src/components/Editor/TipTap/hooks/useEditorSync.ts` and `useEditorEvents.ts` — **remove** the HTML two-way bridge; replaced by `core.applyExternalCells` + `fromExternal` transaction meta.