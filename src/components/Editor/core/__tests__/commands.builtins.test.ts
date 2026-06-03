import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { history, undo } from 'prosemirror-history';
import { Node as PMNode } from 'prosemirror-model';
import { notebookSchema as s, NODE } from '../schema';
import { CommandRegistry, FullCommandContext } from '../NotebookCommand';
import { NotebookTransaction } from '../NotebookTransaction';
import { BufferingIntentSink, EditorIntent } from '../intents';
import {
  createBuiltinCommands,
  resetBuiltinIdCounter,
  SPECIAL_DOWNGRADE,
} from '../commands/builtins';
import { txCommand, serviceCommand } from '../commands/factories';
import { first, sequence, when, tap } from '../commands/combinators';

// --- fixtures --------------------------------------------------------------

/** Fresh doc: titleBlock + one markdown cell containing a paragraph with `text`. */
function freshDoc(text = 'hello'): PMNode {
  return s.node('notebook', null, [
    s.node('titleBlock', { cellId: 'title' }, s.text('Title')),
    s.node('notebookCell', { cellId: 'c1' }, [
      s.node('markdownBlock', null, [s.node('paragraph', null, text ? s.text(text) : null)]),
    ]),
  ]);
}

function freshState(text = 'hello'): EditorState {
  const doc = freshDoc(text);
  const state = EditorState.create({ schema: s, doc, plugins: [history()] });
  // Place selection inside the paragraph of the markdown cell.
  // pos: title(content size) ... find the paragraph.
  let target = 0;
  doc.descendants((node, pos) => {
    if (node.type.name === NODE.paragraph) target = pos + 1;
    return true;
  });
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, target)));
}

interface Harness {
  state: EditorState;
  intents: BufferingIntentSink;
  ctx(arg?: string): FullCommandContext;
  setState(s: EditorState): void;
}

function harness(initial?: EditorState): Harness {
  const intents = new BufferingIntentSink();
  let state = initial ?? freshState();
  const h: Harness = {
    get state() {
      return state;
    },
    set state(v: EditorState) {
      state = v;
    },
    intents,
    setState(v) {
      state = v;
    },
    ctx(arg?: string) {
      return {
        state,
        dispatch: (ntx: NotebookTransaction) => {
          state = state.apply(ntx.tr);
        },
        view: null,
        schema: s,
        services: {},
        doc: undefined as never, // not needed by these commands
        selection: state.selection,
        arg,
        t: (k, f) => f ?? k,
        intents,
        isNodeActive: (typeName, attrs) => {
          const { $from } = state.selection;
          for (let d = $from.depth; d >= 0; d--) {
            const n = $from.node(d);
            if (
              n.type.name === typeName &&
              (!attrs || Object.keys(attrs).every((k) => n.attrs[k] === attrs[k]))
            )
              return true;
          }
          return false;
        },
        isMarkActive: (markType) => {
          const type = s.marks[markType];
          if (!type) return false;
          const { from, to, empty, $from } = state.selection;
          if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
          return state.doc.rangeHasMark(from, to, type);
        },
        currentCellId: () => {
          const { $from } = state.selection;
          for (let d = $from.depth; d >= 0; d--) {
            const n = $from.node(d);
            if (n.type.name === NODE.notebookCell) return (n.attrs.cellId as string) ?? null;
          }
          return null;
        },
      };
    },
  };
  return h;
}

function byId(id: string) {
  return createBuiltinCommands().find((c) => c.id === id)!;
}

beforeEach(() => resetBuiltinIdCounter());

// --- builtins produce schema-valid docs ------------------------------------

describe('builtin block commands produce schema-valid docs', () => {
  it('heading-1 toggles the current paragraph to an h1', () => {
    const h = harness();
    const ok = byId('heading-1').run(h.ctx());
    expect(ok).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
    let found = false;
    h.state.doc.descendants((n) => {
      if (n.type.name === NODE.heading && n.attrs.level === 1) found = true;
      return true;
    });
    expect(found).toBe(true);
  });

  it('heading-1 isActive reflects the toggled-on state', () => {
    const h = harness();
    expect(byId('heading-1').isActive!(h.ctx())).toBe(false);
    byId('heading-1').run(h.ctx());
    expect(byId('heading-1').isActive!(h.ctx())).toBe(true);
  });

  it('bullet-list wraps the paragraph in a bulletList>listItem', () => {
    const h = harness();
    expect(byId('bullet-list').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
    let bl = false;
    h.state.doc.descendants((n) => {
      if (n.type.name === NODE.bulletList) bl = true;
      return true;
    });
    expect(bl).toBe(true);
  });

  it('ordered-list wraps with start:1', () => {
    const h = harness();
    expect(byId('ordered-list').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
  });

  it('task-list wraps and marks the first item checked:false', () => {
    const h = harness();
    expect(byId('task-list').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
    let checkedFound = false;
    h.state.doc.descendants((n) => {
      if (n.type.name === NODE.listItem && n.attrs.checked === false) checkedFound = true;
      return true;
    });
    expect(checkedFound).toBe(true);
  });

  it('blockquote wraps the paragraph', () => {
    const h = harness();
    expect(byId('blockquote').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
  });

  it('divider inserts a horizontalRule', () => {
    const h = harness();
    expect(byId('divider').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
    let hr = false;
    h.state.doc.descendants((n) => {
      if (n.type.name === NODE.horizontalRule) hr = true;
      return true;
    });
    expect(hr).toBe(true);
  });

  it('math inserts a mathDisplay node', () => {
    const h = harness();
    expect(byId('math').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
  });

  it('code-cell inserts a notebookCell>codeCell>codeText and emits focusCell', () => {
    const h = harness();
    expect(byId('code-cell').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
    let cc = false;
    h.state.doc.descendants((n) => {
      if (n.type.name === NODE.codeCell) cc = true;
      return true;
    });
    expect(cc).toBe(true);
    const intents = h.intents.drain();
    expect(intents.some((i) => i.kind === 'focusCell')).toBe(true);
    // stable id from deterministic counter
    const focus = intents.find((i) => i.kind === 'focusCell') as Extract<
      EditorIntent,
      { kind: 'focusCell' }
    >;
    expect(focus.cellId).toBe('cell-1');
  });

  it('table inserts a 3x3 prosemirror-tables table with a header row', () => {
    const h = harness();
    expect(byId('table').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
    let rows = 0;
    let headers = 0;
    h.state.doc.descendants((n) => {
      if (n.type.name === NODE.tableRow) rows++;
      if (n.type.name === NODE.tableHeader) headers++;
      return true;
    });
    expect(rows).toBe(3);
    expect(headers).toBe(3);
  });

  it('raw-block inserts a notebookCell>rawBlock', () => {
    const h = harness();
    expect(byId('raw-block').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
  });

  it('thinking inserts a thinkingBlock with phase:thinking', () => {
    const h = harness();
    expect(byId('thinking').run(h.ctx())).toBe(true);
    expect(() => h.state.doc.check()).not.toThrow();
    let phase: string | null = null;
    h.state.doc.descendants((n) => {
      if (n.type.name === NODE.thinkingBlock) phase = n.attrs.phase as string;
      return true;
    });
    expect(phase).toBe('thinking');
  });

  it('image emits openPrompt when no url, inserts imageBlock when url present', () => {
    const h1 = harness();
    expect(byId('image').run(h1.ctx())).toBe(true);
    expect(h1.intents.drain().some((i) => i.kind === 'openPrompt')).toBe(true);

    const h2 = harness();
    expect(byId('image').run(h2.ctx('https://x/y.png'))).toBe(true);
    expect(() => h2.state.doc.check()).not.toThrow();
    let img = false;
    h2.state.doc.descendants((n) => {
      if (n.type.name === NODE.imageBlock) img = true;
      return true;
    });
    expect(img).toBe(true);
  });
});

// --- format marks ----------------------------------------------------------

describe('format mark commands', () => {
  it('bold toggles strong and isActive tracks it', () => {
    // selection must be non-empty for toggleMark to apply
    const base = freshState('hello');
    const sel = TextSelection.create(base.doc, base.selection.from - 1, base.selection.from + 4);
    const h = harness(base.apply(base.tr.setSelection(sel)));
    expect(byId('bold').isActive!(h.ctx())).toBe(false);
    expect(byId('bold').run(h.ctx())).toBe(true);
    expect(byId('bold').isActive!(h.ctx())).toBe(true);
  });

  it('inline-code id is distinct from code-cell', () => {
    const cmds = createBuiltinCommands();
    expect(cmds.find((c) => c.id === 'inline-code')).toBeTruthy();
    expect(cmds.find((c) => c.id === 'code-cell')).toBeTruthy();
  });
});

// --- nav / structural ------------------------------------------------------

describe('nav commands', () => {
  it('nav.tab swallows Tab (returns true, no tx)', () => {
    const h = harness();
    const before = h.state.doc;
    expect(byId('nav.tab').run(h.ctx())).toBe(true);
    expect(h.state.doc).toBe(before);
  });

  it('nav.doc-start / nav.doc-end move the selection', () => {
    const h = harness();
    expect(byId('nav.doc-end').run(h.ctx())).toBe(true);
    const endPos = h.state.selection.head;
    expect(byId('nav.doc-start').run(h.ctx())).toBe(true);
    expect(h.state.selection.head).toBeLessThan(endPos);
  });

  it('nav.backspace-downgrade returns false headless (no view)', () => {
    const h = harness();
    expect(byId('nav.backspace-downgrade').canRun!(h.ctx())).toBe(false);
    expect(byId('nav.backspace-downgrade').run(h.ctx())).toBe(false);
  });

  it('SPECIAL_DOWNGRADE uses NODE constants', () => {
    expect(SPECIAL_DOWNGRADE).toEqual([NODE.codeCell, NODE.thinkingBlock, NODE.rawBlock]);
  });
});

// --- service commands ------------------------------------------------------

describe('service-backed commands', () => {
  it('exec.run is hidden (isAvailable false) when execution service absent', () => {
    const h = harness();
    expect(byId('exec.run').isAvailable!(h.ctx())).toBe(false);
  });

  it('exec.run fires execution.execute for the current code cell', () => {
    // build a doc with a code cell and select inside its codeText
    const doc = s.node('notebook', null, [
      s.node('titleBlock', { cellId: 'title' }, s.text('T')),
      s.node('notebookCell', { cellId: 'code1' }, [
        s.node('codeCell', { language: 'python' }, [s.node('codeText', null, s.text('print(1)'))]),
      ]),
    ]);
    let state = EditorState.create({ schema: s, doc });
    // selection inside codeText
    let target = 0;
    doc.descendants((n, pos) => {
      if (n.type.name === NODE.codeText) target = pos + 1;
      return true;
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, target)));

    const calls: Array<[string, string, string]> = [];
    const ctx = {
      ...harness(state).ctx(),
      services: {
        execution: {
          execute: (cellId: string, code: string, language: string) => {
            calls.push([cellId, code, language]);
            return Promise.resolve();
          },
          cancel: () => {},
        },
      },
    } as unknown as FullCommandContext;

    expect(byId('exec.run').isAvailable!(ctx)).toBe(true);
    const r = byId('exec.run').run(ctx);
    expect(r).toBe(true);
    expect(calls).toEqual([['code1', 'print(1)', 'python']]);
  });
});

// --- factories -------------------------------------------------------------

describe('authoring factories', () => {
  it('serviceCommand auto-sets isAvailable from the dep', () => {
    const cmd = serviceCommand({ id: 'x.test', title: 't', group: 'exec' }, 'upload', () => true);
    const h = harness();
    expect(cmd.isAvailable!(h.ctx())).toBe(false);
    const ctx = {
      ...h.ctx(),
      services: { upload: { upload: () => Promise.resolve({ src: '' }) } },
    } as FullCommandContext;
    expect(cmd.isAvailable!(ctx)).toBe(true);
  });

  it('txCommand canRun reflects whether the builder returns a tr', () => {
    const yes = txCommand({ id: 'tx.yes', title: 't' }, (ctx) => ctx.state.tr.insertText('!', 1));
    const no = txCommand({ id: 'tx.no', title: 't' }, () => null);
    const h = harness();
    expect(yes.canRun!(h.ctx())).toBe(true);
    expect(no.canRun!(h.ctx())).toBe(false);
    expect(no.run(h.ctx())).toBe(false);
  });
});

// --- combinators -----------------------------------------------------------

describe('combinators', () => {
  it('first() stops at the first command that returns true', () => {
    const calls: string[] = [];
    const a = (() => {
      calls.push('a');
      return false;
    }) as never;
    const b = (() => {
      calls.push('b');
      return true;
    }) as never;
    const c = (() => {
      calls.push('c');
      return true;
    }) as never;
    const h = harness();
    expect(first(a, b, c)(h.ctx())).toBe(true);
    expect(calls).toEqual(['a', 'b']);
  });

  it('when() branches on the predicate', () => {
    const h = harness();
    let ran = '';
    when(
      () => true,
      tap(() => (ran = 'then')),
      tap(() => (ran = 'else'))
    )(h.ctx());
    expect(ran).toBe('then');
  });

  it('tap() runs a side-effect and returns true', () => {
    const h = harness();
    let touched = false;
    expect(tap(() => (touched = true))(h.ctx())).toBe(true);
    expect(touched).toBe(true);
  });

  it('sequence() commits multiple steps as ONE undoable transaction', () => {
    const h = harness();
    const stepA = txCommand({ id: 'a', title: 'a' }, (ctx) =>
      ctx.state.tr.insertText('A', ctx.selection.from)
    );
    const stepB = txCommand({ id: 'b', title: 'b' }, (ctx) =>
      ctx.state.tr.insertText('B', ctx.selection.from + 1)
    );

    const before = h.state.doc.textContent;
    const ok = sequence(
      (ctx) => stepA.run(ctx) as boolean,
      (ctx) => stepB.run(ctx) as boolean
    )(h.ctx());
    expect(ok).toBe(true);
    const after = h.state.doc.textContent;
    expect(after).not.toBe(before);

    // a single undo reverts the whole sequence
    const undone = undoOnce(h.state);
    expect(undone.doc.textContent).toBe(before);
  });

  // REGRESSION (confirmed-failure #2/#4): sequence() must NOT double-map the
  // final selection. Composing two real structural block-insert builtins (each
  // sets a selection via insertCellAfterSelection) used to throw
  // 'RangeError: Position N out of range' at combinators.ts because
  // current.selection (already in final-doc space) was re-mapped a second time
  // through the full accumulated master.mapping.
  it('sequence() of two cell-inserting builtins commits once without RangeError', () => {
    const h = harness();
    const before = h.state.doc.textContent;

    let ok = false;
    expect(() => {
      ok = sequence(
        (ctx) => byId('code-cell').run(ctx) as boolean,
        (ctx) => byId('raw-block').run(ctx) as boolean
      )(h.ctx()) as boolean;
    }).not.toThrow();
    expect(ok).toBe(true);

    // both cells were inserted and the doc is schema-valid with an in-range selection
    expect(() => h.state.doc.check()).not.toThrow();
    let cc = 0;
    let rb = 0;
    h.state.doc.descendants((n) => {
      if (n.type.name === NODE.codeCell) cc++;
      if (n.type.name === NODE.rawBlock) rb++;
      return true;
    });
    expect(cc).toBe(1);
    expect(rb).toBe(1);
    expect(h.state.selection.head).toBeLessThanOrEqual(h.state.doc.content.size);

    // ONE undo reverts BOTH inserts
    const undone = undoOnce(h.state);
    expect(undone.doc.textContent).toBe(before);
    let ccAfter = 0;
    undone.doc.descendants((n) => {
      if (n.type.name === NODE.codeCell) ccAfter++;
      return true;
    });
    expect(ccAfter).toBe(0);
  });

  // REGRESSION (confirmed-failure #3): first() must treat an async branch that
  // returns a truthy Promise as "handled" — it must STOP there (no later branch
  // runs, no double side-effects) and report handled.
  it('first() stops at an async branch and does not run later branches', async () => {
    const h = harness();
    let secondRan = false;
    const asyncBranch = (() => Promise.resolve(true)) as never;
    const syncBranch = (() => {
      secondRan = true;
      return true;
    }) as never;

    const result = first(asyncBranch, syncBranch)(h.ctx());
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(secondRan).toBe(false);
    expect(await (result as Promise<boolean>)).toBe(true);
  });

  it('first() with a single async branch reports handled', async () => {
    const h = harness();
    const onlyAsync = (() => Promise.resolve(true)) as never;
    const result = first(onlyAsync)(h.ctx());
    expect(result).toBeInstanceOf(Promise);
    expect(await (result as Promise<boolean>)).toBe(true);
  });
});

// helper: apply prosemirror-history undo once
function undoOnce(state: EditorState): EditorState {
  let next = state;
  undo(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

// --- registry --------------------------------------------------------------

describe('CommandRegistry (Phase 3)', () => {
  it('registerAll is duplicate-safe (last-wins, no throw)', () => {
    const reg = new CommandRegistry();
    const cmds = createBuiltinCommands();
    expect(() => reg.registerAll(cmds)).not.toThrow();
    expect(() => reg.registerAll(cmds)).not.toThrow();
    expect(reg.all().length).toBe(cmds.length);
  });

  it('register replaces an existing id (host override)', () => {
    const reg = new CommandRegistry();
    reg.register({ id: 'image', title: 'orig', run: () => true });
    reg.register({ id: 'image', title: 'override', run: () => true });
    expect(reg.get('image')!.title).toBe('override');
  });

  it('list({surface,state}) filters by surface and availability', () => {
    const reg = new CommandRegistry();
    reg.registerAll(createBuiltinCommands());
    const state = freshState();
    const slash = reg.list({ surface: 'slash', state });
    expect(slash.length).toBeGreaterThan(0);
    expect(slash.every((r) => !r.command.surfaces || r.command.surfaces.includes('slash'))).toBe(
      true
    );
    // exec.run requires execution service -> hidden
    expect(slash.find((r) => r.command.id === 'exec.run')).toBeUndefined();
  });

  it('list() with a query scores + orders by relevance', () => {
    const reg = new CommandRegistry();
    reg.registerAll(createBuiltinCommands());
    const state = freshState();
    const res = reg.list({ surface: 'slash', state, query: 'heading' });
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].command.id.startsWith('heading')).toBe(true);
  });

  it('toKeymap() returns handlers keyed by keybinding', () => {
    const reg = new CommandRegistry();
    reg.registerAll(createBuiltinCommands());
    const km = reg.toKeymap();
    expect(typeof km['Mod-b']).toBe('function');
    expect(typeof km['Mod-z']).toBe('function');
    expect(typeof km['Mod-s']).toBe('function');
    expect(typeof km['Tab']).toBe('function');
  });

  it('async service command returns true synchronously via toKeymap handler', () => {
    const reg = new CommandRegistry();
    reg.registerAll(createBuiltinCommands());
    reg.setDefaults({
      services: {
        execution: {
          execute: () => new Promise<void>(() => {}), // never resolves
          cancel: () => {},
        },
      },
    });
    const doc = s.node('notebook', null, [
      s.node('titleBlock', { cellId: 'title' }, s.text('T')),
      s.node('notebookCell', { cellId: 'code1' }, [
        s.node('codeCell', { language: 'python' }, [s.node('codeText', null, s.text('x'))]),
      ]),
    ]);
    let state = EditorState.create({ schema: s, doc });
    let target = 0;
    doc.descendants((n, pos) => {
      if (n.type.name === NODE.codeText) target = pos + 1;
      return true;
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, target)));
    const km = reg.toKeymap();
    const handled = km['Mod-Enter'](state, () => {});
    expect(handled).toBe(true); // claimed handled immediately despite pending promise
  });

  it('toKeymap dry-run probe (no dispatch) does not throw and returns boolean', () => {
    const reg = new CommandRegistry();
    reg.registerAll(createBuiltinCommands());
    const state = freshState();
    const km = reg.toKeymap();
    const r = km['Mod-b'](state); // no dispatch => probe
    expect(typeof r).toBe('boolean');
  });

  // REGRESSION (confirmed-failure #1): Mod-k with an EMPTY cursor and no link
  // mark must HANDLE the key and emit an openPrompt intent. canRun used to gate
  // on (!selection.empty || isMarkActive('link')), which is false for an empty
  // cursor, so the keymap bridge never called run() and Mod-k was dead.
  it('Mod-k handles an empty-cursor selection and emits openPrompt (canRun mirrors run)', () => {
    const reg = new CommandRegistry();
    reg.registerAll(createBuiltinCommands());
    const intents = new BufferingIntentSink();
    reg.setDefaults({ intents });

    // Fresh paragraph 'hello' with an EMPTY cursor, no existing link mark.
    const state = freshState('hello'); // freshState places a collapsed cursor
    expect(state.selection.empty).toBe(true);

    const km = reg.toKeymap();
    const handled = km['Mod-k'](state, () => {});
    expect(handled).toBe(true);

    const emitted = intents.drain();
    expect(emitted.some((i) => i.kind === 'openPrompt' && i.field === 'linkHref')).toBe(true);
  });

  it('link.canRun reports true for an empty cursor with no link (prompt path)', () => {
    const link = byId('link');
    const h = harness(freshState('hello'));
    expect(h.state.selection.empty).toBe(true);
    expect(link.canRun!(h.ctx())).toBe(true);
    // and run() on that very state actually handles + emits the prompt intent
    expect(link.run(h.ctx())).toBe(true);
    expect(h.intents.drain().some((i) => i.kind === 'openPrompt')).toBe(true);
  });
});
