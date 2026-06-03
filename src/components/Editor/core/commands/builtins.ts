/**
 * Builtin command catalog (Phase 3).
 *
 * Ports the LIVE TipTap slash + bubble + keymap surfaces into framework-free
 * registry commands targeting the NEW schema (core/schema.ts NODE constants).
 * Legacy TipTap node names (executableCodeBlock / thinkingCell / rawBlock-via-
 * insertContent / setImage / setLaTeX / insertTable) are retargeted to
 * codeCell+codeText / thinkingBlock / rawBlock / imageBlock / mathDisplay /
 * prosemirror-tables.
 *
 * Invariants:
 *  - No React/Zustand/window/fetch/CustomEvent/querySelector/window.prompt.
 *  - Cross-cell focus + URL prompts route through typed `ctx.intents`.
 *  - Node-type checks go through the NODE constants, never string literals.
 *  - New cells get a stable cellId via an injected idFactory or a deterministic
 *    in-module counter (core stays crypto-free).
 *
 * Framework-free: prosemirror-* + relative ./ only.
 *
 * See docs/migration/02-command-registry.md §5, §7, §8.
 */
import { EditorState, Selection, Transaction } from 'prosemirror-state';
import { Node as PMNode, NodeType, Fragment } from 'prosemirror-model';
import { setBlockType, wrapIn, toggleMark } from 'prosemirror-commands';
import { wrapInList } from 'prosemirror-schema-list';
import { undo, redo } from 'prosemirror-history';
import { NODE } from '../schema';
import { NotebookCommand, FullCommandContext, CommandSurface } from '../NotebookCommand';
import { NotebookTransaction } from '../NotebookTransaction';
import { txCommand, serviceCommand, CommandMeta } from './factories';

// ---------------------------------------------------------------------------
// Id minting (deterministic fallback; host may inject services.idFactory)
// ---------------------------------------------------------------------------

let idCounter = 0;
/** Reset the deterministic counter (test helper). */
export function resetBuiltinIdCounter(): void {
  idCounter = 0;
}
function mintCellId(ctx: FullCommandContext): string {
  const injected = ctx.services.idFactory?.();
  return injected ?? `cell-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// Schema-valid node construction helpers
// ---------------------------------------------------------------------------

function paragraphNode(state: EditorState, text?: string): PMNode {
  return state.schema.nodes[NODE.paragraph].create(null, text ? state.schema.text(text) : null);
}

function bodyCell(state: EditorState, cellId: string, body: PMNode): PMNode {
  return state.schema.nodes[NODE.notebookCell].create({ cellId }, body);
}

/** Top-level index of the notebookCell containing `pos` (0-based among children). */
function cellIndexAt(state: EditorState, pos: number): number {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  // depth 1 child is the top-level child (titleBlock or notebookCell)
  if ($pos.depth >= 1) return $pos.index(0);
  return state.doc.childCount - 1;
}

/** PM position just AFTER the top-level child at `childIndex`. */
function endOfChild(state: EditorState, childIndex: number): number {
  let pos = 0;
  for (let i = 0; i <= childIndex && i < state.doc.childCount; i++) {
    pos += state.doc.child(i).nodeSize;
  }
  return pos;
}

/**
 * Insert a fully-formed notebookCell AFTER the cell containing the selection,
 * then place the selection inside it.
 */
function insertCellAfterSelection(
  state: EditorState,
  cell: PMNode,
  selectInside = true
): Transaction {
  const idx = cellIndexAt(state, state.selection.head);
  const insertPos = endOfChild(state, idx);
  const tr = state.tr.insert(insertPos, cell);
  if (selectInside) {
    const sel = Selection.near(tr.doc.resolve(insertPos + 1), 1);
    tr.setSelection(sel);
  }
  tr.scrollIntoView();
  return tr;
}

// ---------------------------------------------------------------------------
// PM-command adaptor (toggle / wrap commands that dispatch internally)
// ---------------------------------------------------------------------------

type PMCommand = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

/** Wrap a PM command (state,dispatch)=>boolean into a NotebookCommand. */
function pmCommand(meta: CommandMeta, command: PMCommand): NotebookCommand {
  const cmd: NotebookCommand = {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    icon: meta.icon,
    group: meta.group,
    keywords: meta.keywords,
    keybinding: meta.keybinding,
    surfaces: meta.surfaces,
    canRun: (ctx) => command(ctx.state),
    run: (ctx) => {
      return command(ctx.state, (tr) => ctx.dispatch(new NotebookTransaction(tr)));
    },
  };
  if (meta.isActive) cmd.isActive = meta.isActive;
  return cmd;
}

// ---------------------------------------------------------------------------
// Builtin command factory
// ---------------------------------------------------------------------------

const SLASH: CommandSurface[] = ['slash'];
const SLASH_TOOLBAR: CommandSurface[] = ['slash', 'toolbar'];
const TOOLBAR: CommandSurface[] = ['toolbar'];
const KEYBOARD: CommandSurface[] = ['keyboard'];

/** Special cell-body nodes the Backspace handler downgrades to a paragraph. */
export const SPECIAL_DOWNGRADE: string[] = [NODE.codeCell, NODE.thinkingBlock, NODE.rawBlock];

export function createBuiltinCommands(): NotebookCommand[] {
  const paraType = (state: EditorState): NodeType => state.schema.nodes[NODE.paragraph];

  const headingActive =
    (level: number) =>
    (ctx: FullCommandContext): boolean =>
      ctx.isNodeActive(NODE.heading, { level });

  const commands: NotebookCommand[] = [
    // --- basic: paragraph & headings (block, inside markdownBlock) --------
    pmCommand(
      {
        id: 'paragraph',
        title: 'cmd.paragraph',
        group: 'basic',
        keywords: ['text', 'paragraph', '文本', '段落', 'txt'],
        surfaces: SLASH,
      },
      (state, dispatch) => setBlockType(paraType(state))(state, dispatch)
    ),
    pmCommand(
      {
        id: 'heading-1',
        title: 'cmd.heading1',
        group: 'basic',
        keywords: ['h1', 'heading', 'title', '标题', '大标题'],
        keybinding: 'Mod-Alt-1',
        surfaces: SLASH_TOOLBAR,
        isActive: headingActive(1),
      },
      (state, dispatch) => toggleHeading(state, dispatch, 1)
    ),
    pmCommand(
      {
        id: 'heading-2',
        title: 'cmd.heading2',
        group: 'basic',
        keywords: ['h2', 'heading', 'subtitle', '标题', '中标题'],
        keybinding: 'Mod-Alt-2',
        surfaces: SLASH_TOOLBAR,
        isActive: headingActive(2),
      },
      (state, dispatch) => toggleHeading(state, dispatch, 2)
    ),
    pmCommand(
      {
        id: 'heading-3',
        title: 'cmd.heading3',
        group: 'basic',
        keywords: ['h3', 'heading', '标题', '小标题'],
        keybinding: 'Mod-Alt-3',
        surfaces: SLASH,
        isActive: headingActive(3),
      },
      (state, dispatch) => toggleHeading(state, dispatch, 3)
    ),

    // --- basic: lists & quote --------------------------------------------
    pmCommand(
      {
        id: 'bullet-list',
        title: 'cmd.bulletList',
        group: 'basic',
        keywords: ['list', 'bullet', 'ul', '列表', '无序'],
        keybinding: 'Mod-Shift-8',
        surfaces: SLASH_TOOLBAR,
        isActive: (ctx) => ctx.isNodeActive(NODE.bulletList),
      },
      (state, dispatch) => wrapInList(state.schema.nodes[NODE.bulletList])(state, dispatch)
    ),
    pmCommand(
      {
        id: 'ordered-list',
        title: 'cmd.orderedList',
        group: 'basic',
        keywords: ['list', 'numbered', 'ordered', 'ol', '列表', '有序', '编号'],
        keybinding: 'Mod-Shift-9',
        surfaces: SLASH_TOOLBAR,
        isActive: (ctx) => ctx.isNodeActive(NODE.orderedList),
      },
      (state, dispatch) =>
        wrapInList(state.schema.nodes[NODE.orderedList], { start: 1 })(state, dispatch)
    ),
    pmCommand(
      {
        id: 'task-list',
        title: 'cmd.taskList',
        group: 'basic',
        keywords: ['task', 'todo', 'checklist', 'check', '任务', '待办'],
        surfaces: SLASH,
        isActive: (ctx) => ctx.isNodeActive(NODE.listItem, { checked: false }),
      },
      // Task list = bullet list whose items carry a `checked` attr.
      (state, dispatch) =>
        wrapInList(state.schema.nodes[NODE.bulletList])(state, (tr) => {
          if (dispatch) dispatch(markFirstListItemChecked(tr, state));
        })
    ),
    pmCommand(
      {
        id: 'blockquote',
        title: 'cmd.blockquote',
        group: 'basic',
        keywords: ['quote', 'blockquote', '引用'],
        keybinding: 'Mod-Shift-b',
        surfaces: SLASH_TOOLBAR,
        isActive: (ctx) => ctx.isNodeActive(NODE.blockquote),
      },
      (state, dispatch) => wrapIn(state.schema.nodes[NODE.blockquote])(state, dispatch)
    ),

    // --- block: divider & math (inside markdownBlock) --------------------
    pmCommand(
      {
        id: 'divider',
        title: 'cmd.divider',
        group: 'block',
        keywords: ['divider', 'hr', 'rule', 'separator', '分割线', '分隔'],
        surfaces: SLASH,
      },
      (state, dispatch) => {
        const hr = state.schema.nodes[NODE.horizontalRule];
        if (!canInsertInline(state, hr)) return false;
        if (dispatch) dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
        return true;
      }
    ),
    pmCommand(
      {
        id: 'math',
        title: 'cmd.math',
        group: 'block',
        keywords: ['math', 'latex', 'formula', '数学', '公式'],
        surfaces: SLASH,
      },
      (state, dispatch) => {
        const math = state.schema.nodes[NODE.mathDisplay];
        if (!canInsertInline(state, math)) return false;
        if (dispatch) {
          dispatch(
            state.tr
              .replaceSelectionWith(math.create(null, state.schema.text('E = mc^2')))
              .scrollIntoView()
          );
        }
        return true;
      }
    ),

    // --- block: code cell (notebookCell wrapper) -------------------------
    {
      id: 'code-cell',
      title: 'cmd.code',
      description: 'Insert an executable code cell',
      icon: 'code',
      group: 'block',
      keywords: ['code', 'codeblock', 'python', '代码', 'run'],
      keybinding: 'Mod-Alt-c',
      surfaces: SLASH,
      run: (ctx) => {
        const cellId = mintCellId(ctx);
        const codeText = ctx.state.schema.nodes[NODE.codeText].create();
        const codeCell = ctx.state.schema.nodes[NODE.codeCell].create(
          { language: 'python' },
          codeText
        );
        const cell = bodyCell(ctx.state, cellId, codeCell);
        const tr = insertCellAfterSelection(ctx.state, cell, true);
        ctx.dispatch(new NotebookTransaction(tr));
        ctx.intents.emit({ kind: 'focusCell', cellId, place: 'start' });
        return true;
      },
    },

    // --- block: table (prosemirror-tables, notebookCell wrapper) ---------
    {
      id: 'table',
      title: 'cmd.table',
      group: 'block',
      keywords: ['table', 'grid', '表格'],
      surfaces: SLASH,
      run: (ctx) => {
        const cellId = mintCellId(ctx);
        const table = buildTable(ctx.state, 3, 3);
        const cell = bodyCell(ctx.state, cellId, table);
        const tr = insertCellAfterSelection(ctx.state, cell, true);
        ctx.dispatch(new NotebookTransaction(tr));
        return true;
      },
    },

    // --- block: raw (notebookCell wrapper) -------------------------------
    {
      id: 'raw-block',
      title: 'cmd.raw',
      group: 'block',
      keywords: ['raw', 'text', 'plain', '原始', '文本'],
      surfaces: SLASH,
      run: (ctx) => {
        const cellId = mintCellId(ctx);
        const raw = ctx.state.schema.nodes[NODE.rawBlock].create({ format: 'markdown' });
        const cell = bodyCell(ctx.state, cellId, raw);
        const tr = insertCellAfterSelection(ctx.state, cell, true);
        ctx.dispatch(new NotebookTransaction(tr));
        return true;
      },
    },

    // --- ai: thinking block (notebookCell wrapper) -----------------------
    {
      id: 'thinking',
      title: 'cmd.thinking',
      group: 'ai',
      keywords: ['ai', 'thinking', 'assistant', '思考', '助手'],
      surfaces: SLASH,
      run: (ctx) => {
        const cellId = mintCellId(ctx);
        const thinking = ctx.state.schema.nodes[NODE.thinkingBlock].create({
          cellId,
          agentName: 'AI',
          phase: 'thinking',
          text: '',
          textArray: [],
        });
        const cell = bodyCell(ctx.state, cellId, thinking);
        const tr = insertCellAfterSelection(ctx.state, cell, true);
        ctx.dispatch(new NotebookTransaction(tr));
        return true;
      },
    },

    // --- media: image (block; prompt via intent if no url) ---------------
    {
      id: 'image',
      title: 'cmd.image',
      group: 'media',
      keywords: ['image', 'photo', 'picture', '图片', '照片', 'img'],
      surfaces: SLASH,
      run: (ctx) => {
        const url = parseUrlArg(ctx.arg, 'image');
        if (!url) {
          ctx.intents.emit({
            kind: 'openPrompt',
            field: 'imageUrl',
            token: ctx.currentCellId() ?? '',
          });
          return true;
        }
        const cellId = mintCellId(ctx);
        const image = ctx.state.schema.nodes[NODE.imageBlock].create({
          src: url,
          alt: '',
          source: 'upload',
        });
        const cell = bodyCell(ctx.state, cellId, image);
        const tr = insertCellAfterSelection(ctx.state, cell, true);
        ctx.dispatch(new NotebookTransaction(tr));
        return true;
      },
    },

    // --- format marks (toolbar + keyboard) -------------------------------
    markCommand(
      {
        id: 'bold',
        title: 'cmd.bold',
        group: 'format',
        keywords: ['bold', 'strong', '粗体', '加粗'],
        keybinding: 'Mod-b',
        surfaces: [...TOOLBAR, ...KEYBOARD],
      },
      'strong'
    ),
    markCommand(
      {
        id: 'italic',
        title: 'cmd.italic',
        group: 'format',
        keywords: ['italic', 'em', 'emphasis', '斜体'],
        keybinding: 'Mod-i',
        surfaces: [...TOOLBAR, ...KEYBOARD],
      },
      'em'
    ),
    markCommand(
      {
        id: 'strike',
        title: 'cmd.strike',
        group: 'format',
        keywords: ['strike', 'strikethrough', 'del', '删除线'],
        keybinding: 'Mod-Shift-s',
        surfaces: [...TOOLBAR, ...KEYBOARD],
      },
      'strike'
    ),
    markCommand(
      {
        id: 'inline-code',
        title: 'cmd.inlineCode',
        group: 'format',
        keywords: ['code', 'inline', 'mono', '行内代码', '代码'],
        keybinding: 'Mod-e',
        surfaces: [...TOOLBAR, ...KEYBOARD],
      },
      'code'
    ),
    {
      id: 'link',
      title: 'cmd.link',
      group: 'format',
      keywords: ['link', 'url', 'href', '链接'],
      keybinding: 'Mod-k',
      surfaces: [...TOOLBAR, ...KEYBOARD],
      isActive: (ctx) => ctx.isMarkActive('link'),
      // canRun must mirror run's applicability. With no usable URL arg, run()
      // emits an openPrompt intent (always applicable) so the shell can collect
      // a URL — that is the only keyboard route (Mod-k) to the link prompt and
      // must not be gated out by an empty selection. With a URL arg, run()
      // toggles the link mark, which requires a selection or an active link.
      canRun: (ctx) => {
        const url = parseLinkArg(ctx.arg);
        if (!url) return true; // prompt-via-intent path
        return !ctx.selection.empty || ctx.isMarkActive('link');
      },
      run: (ctx) => {
        const url = parseLinkArg(ctx.arg);
        if (!url) {
          ctx.intents.emit({
            kind: 'openPrompt',
            field: 'linkHref',
            token: ctx.currentCellId() ?? '',
          });
          return true;
        }
        const linkType = ctx.state.schema.marks.link;
        return toggleMark(linkType, { href: url, kind: 'url' })(ctx.state, (tr) =>
          ctx.dispatch(new NotebookTransaction(tr))
        );
      },
    },

    // --- nav / structural -------------------------------------------------
    {
      id: 'nav.tab',
      title: 'cmd.tab',
      group: 'nav',
      keybinding: 'Tab',
      surfaces: KEYBOARD,
      // Faithful port of LIVE behavior: swallow Tab (preventDefault), no tx.
      run: () => true,
    },
    txCommand(
      {
        id: 'nav.doc-start',
        title: 'cmd.docStart',
        group: 'nav',
        keybinding: 'Mod-Home',
        surfaces: KEYBOARD,
      },
      (ctx) => {
        if (ctx.state.doc.content.size === 0) return null;
        const sel = Selection.near(ctx.state.doc.resolve(0), 1);
        return ctx.state.tr.setSelection(sel).scrollIntoView();
      }
    ),
    txCommand(
      {
        id: 'nav.doc-end',
        title: 'cmd.docEnd',
        group: 'nav',
        keybinding: 'Mod-End',
        surfaces: KEYBOARD,
      },
      (ctx) => {
        const size = ctx.state.doc.content.size;
        if (size === 0) return null;
        const sel = Selection.near(ctx.state.doc.resolve(Math.max(0, size - 1)), 1);
        return ctx.state.tr.setSelection(sel).scrollIntoView();
      }
    ),
    {
      id: 'nav.backspace-downgrade',
      title: 'cmd.backspaceDowngrade',
      group: 'nav',
      keybinding: 'Backspace',
      surfaces: KEYBOARD,
      canRun: (ctx) => backspaceDowngradeTr(ctx) != null,
      run: (ctx) => {
        const tr = backspaceDowngradeTr(ctx);
        if (!tr) return false;
        ctx.dispatch(new NotebookTransaction(tr));
        return true;
      },
    },

    // --- exec (service-backed) -------------------------------------------
    serviceCommand(
      {
        id: 'exec.run',
        title: 'cmd.run',
        group: 'exec',
        icon: 'play',
        keywords: ['run', 'execute', 'cell.run', '运行', '执行'],
        keybinding: 'Mod-Enter',
        surfaces: KEYBOARD,
      },
      'execution',
      (ctx, execution) => {
        const cellId = ctx.currentCellId();
        if (!cellId) return false;
        const found = readCodeCell(ctx.state, cellId);
        if (!found) return false;
        void execution.execute(cellId, found.code, found.language);
        return true;
      }
    ),
    serviceCommand(
      {
        id: 'exec.run-all',
        title: 'cmd.runAll',
        group: 'exec',
        keywords: ['run all', 'execute all', '全部运行'],
        keybinding: 'Mod-Shift-Enter',
        surfaces: KEYBOARD,
      },
      'execution',
      (ctx, execution) => {
        for (const found of allCodeCells(ctx.state)) {
          void execution.execute(found.cellId, found.code, found.language);
        }
        return true;
      }
    ),

    // --- history ----------------------------------------------------------
    {
      id: 'history.undo',
      title: 'cmd.undo',
      group: 'history',
      keybinding: 'Mod-z',
      surfaces: KEYBOARD,
      run: (ctx) => undo(ctx.state, (tr) => ctx.dispatch(new NotebookTransaction(tr))),
    },
    {
      id: 'history.redo',
      title: 'cmd.redo',
      group: 'history',
      keybinding: ['Mod-y', 'Mod-Shift-z'],
      surfaces: KEYBOARD,
      run: (ctx) => redo(ctx.state, (tr) => ctx.dispatch(new NotebookTransaction(tr))),
    },

    // --- doc.save (intent only; no fetch in core) ------------------------
    {
      id: 'doc.save',
      title: 'cmd.save',
      group: 'doc',
      keybinding: 'Mod-s',
      surfaces: KEYBOARD,
      run: (ctx) => {
        ctx.intents.emit({ kind: 'save' });
        return true;
      },
    },
  ];

  return commands;
}

// ---------------------------------------------------------------------------
// Mark command helper
// ---------------------------------------------------------------------------

function markCommand(meta: CommandMeta, markName: string): NotebookCommand {
  const cmd: NotebookCommand = {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    icon: meta.icon,
    group: meta.group,
    keywords: meta.keywords,
    keybinding: meta.keybinding,
    surfaces: meta.surfaces,
    isActive: (ctx) => ctx.isMarkActive(markName),
    canRun: (ctx) => {
      const type = ctx.state.schema.marks[markName];
      return !!type && toggleMark(type)(ctx.state);
    },
    run: (ctx) => {
      const type = ctx.state.schema.marks[markName];
      if (!type) return false;
      return toggleMark(type)(ctx.state, (tr) => ctx.dispatch(new NotebookTransaction(tr)));
    },
  };
  return cmd;
}

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------

/** Toggle heading at the cursor: heading<->paragraph (LIVE toggle semantics). */
function toggleHeading(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  level: number
): boolean {
  const { $from } = state.selection;
  const active = $from.parent.type.name === NODE.heading && $from.parent.attrs.level === level;
  if (active) {
    return setBlockType(state.schema.nodes[NODE.paragraph])(state, dispatch);
  }
  return setBlockType(state.schema.nodes[NODE.heading], { level })(state, dispatch);
}

/** Can a block node be inserted via replaceSelectionWith at the cursor? */
function canInsertInline(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d >= 0; d--) {
    const index = $from.index(d);
    if ($from.node(d).canReplaceWith(index, index, type)) return true;
  }
  return false;
}

/** Set the first listItem's `checked` attr to false (task list) on a wrap tr. */
function markFirstListItemChecked(tr: Transaction, state: EditorState): Transaction {
  const liType = state.schema.nodes[NODE.listItem];
  let target: number | null = null;
  tr.doc.descendants((node, pos) => {
    if (target == null && node.type === liType) target = pos;
    return target == null;
  });
  if (target != null) {
    const li = tr.doc.nodeAt(target);
    if (li) tr.setNodeMarkup(target, undefined, { ...li.attrs, checked: false });
  }
  return tr;
}

/** Build a 3x3 prosemirror-tables table with a header row. */
function buildTable(state: EditorState, rows: number, cols: number): PMNode {
  const s = state.schema;
  const cell = (type: string): PMNode => s.nodes[type].create(null, paragraphNode(state));
  const header = s.nodes[NODE.tableRow].create(
    null,
    Fragment.from(Array.from({ length: cols }, () => cell(NODE.tableHeader)))
  );
  const bodyRows: PMNode[] = [];
  for (let r = 1; r < rows; r++) {
    bodyRows.push(
      s.nodes[NODE.tableRow].create(
        null,
        Fragment.from(Array.from({ length: cols }, () => cell(NODE.tableCell)))
      )
    );
  }
  return s.nodes[NODE.table].create(null, Fragment.from([header, ...bodyRows]));
}

// ---------------------------------------------------------------------------
// Backspace downgrade (special node -> paragraph)
// ---------------------------------------------------------------------------

function backspaceDowngradeTr(ctx: FullCommandContext): Transaction | null {
  const { selection } = ctx.state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if ($from.parent.type.name !== NODE.paragraph) return null;
  if (!ctx.view || !ctx.view.endOfTextblock('backward')) return null;
  const prev = $from.nodeBefore;
  if (!prev || !SPECIAL_DOWNGRADE.includes(prev.type.name)) return null;
  const text = prev.textContent;
  const pos = $from.pos - prev.nodeSize;
  const tr = ctx.state.tr
    .delete(pos, $from.pos)
    .insert(
      pos,
      ctx.state.schema.nodes[NODE.paragraph].create(null, text ? ctx.state.schema.text(text) : null)
    );
  tr.setSelection(Selection.near(tr.doc.resolve(pos + (text ? text.length : 0) + 1)));
  return tr;
}

// ---------------------------------------------------------------------------
// Code-cell reading (for exec.run / run-all)
// ---------------------------------------------------------------------------

interface CodeCellInfo {
  cellId: string;
  code: string;
  language: string;
}

function readCodeCell(state: EditorState, cellId: string): CodeCellInfo | null {
  for (const found of allCodeCells(state)) {
    if (found.cellId === cellId) return found;
  }
  return null;
}

function allCodeCells(state: EditorState): CodeCellInfo[] {
  const out: CodeCellInfo[] = [];
  state.doc.forEach((cell) => {
    if (cell.type.name !== NODE.notebookCell) return;
    const body = cell.childCount > 0 ? cell.child(0) : null;
    if (!body || body.type.name !== NODE.codeCell) return;
    const cellId = (cell.attrs.cellId as string | null) ?? '';
    if (!cellId) return;
    let code = '';
    body.forEach((child) => {
      if (child.type.name === NODE.codeText) code = child.textContent;
    });
    out.push({ cellId, code, language: (body.attrs.language as string) ?? 'python' });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Arg parsing (slash tail / prompt result)
// ---------------------------------------------------------------------------

function parseUrlArg(arg: string | undefined, keyword: string): string | null {
  if (!arg) return null;
  const trimmed = arg.trim();
  if (!trimmed) return null;
  const re = new RegExp(`^${keyword}\\s+(.+)$`, 'i');
  const m = trimmed.match(re);
  if (m) return m[1].trim();
  // A bare URL passed back from the openPrompt intent.
  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed) || trimmed.includes('/'))
    return trimmed;
  return null;
}

function parseLinkArg(arg: string | undefined): string | null {
  if (!arg) return null;
  const trimmed = arg.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^link\s+(.+)$/i);
  if (m) return m[1].trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('.') || trimmed.includes('/'))
    return trimmed;
  return null;
}
