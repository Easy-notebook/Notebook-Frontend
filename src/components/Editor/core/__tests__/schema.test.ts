import { describe, it, expect } from 'vitest';
import { notebookSchema as s, NODE } from '../schema';

const t = (text: string) => s.text(text);

describe('notebookSchema — structure', () => {
  it('exposes all 9 cell-relevant node types + table family', () => {
    for (const name of Object.values(NODE)) {
      expect(s.nodes[name], `missing node ${name}`).toBeDefined();
    }
  });

  it('has the five marks', () => {
    for (const m of ['strong', 'em', 'code', 'strike', 'link']) {
      expect(s.marks[m], `missing mark ${m}`).toBeDefined();
    }
  });

  it('enforces the title-first invariant (notebook = titleBlock notebookCell+)', () => {
    const noTitle = () =>
      s.node('notebook', null, [
        s.node(
          'notebookCell',
          null,
          s.node('markdownBlock', null, s.node('paragraph', null, t('x')))
        ),
      ]);
    // A notebook with no titleBlock is structurally invalid.
    expect(noTitle).toThrow();
  });

  it('builds a full multi-cell document that validates + round-trips through JSON', () => {
    const cell = (body: ReturnType<typeof s.node>, attrs: Record<string, unknown> = {}) =>
      s.node('notebookCell', { cellId: attrs.cellId ?? null, ...attrs }, body);

    const doc = s.node('notebook', null, [
      s.node('titleBlock', { cellId: 'title', isDefault: false }, t('My Notebook')),

      // markdown cell with rich block content
      cell(
        s.node('markdownBlock', null, [
          s.node('heading', { level: 2 }, t('Intro')),
          s.node('paragraph', null, [t('hello '), s.text('bold', [s.mark('strong')])]),
          s.node('bulletList', null, [
            s.node('listItem', null, s.node('paragraph', null, t('a'))),
            s.node('listItem', { checked: false }, s.node('paragraph', null, t('todo'))),
          ]),
          s.node('codeBlock', { language: 'js' }, t('const x = 1;')),
          s.node('mathDisplay', null, t('E = mc^2')),
          s.node('paragraph', null, [t('inline '), s.node('mathInline', null, t('x^2'))]),
        ]),
        { cellId: 'c1' }
      ),

      // code cell with output
      cell(
        s.node('codeCell', { language: 'python', executionCount: 1 }, [
          s.node('codeText', null, t('print("hi")')),
          s.node('outputBlock', {
            status: 'ok',
            items: [{ kind: 'text', data: 'hi', key: 'o1' }],
            executionCount: 1,
          }),
        ]),
        { cellId: 'c2' }
      ),

      // thinking cell (durable attrs)
      cell(s.node('thinkingBlock', { agentName: 'planner', phase: 'done', text: 'reasoned' }), {
        cellId: 'c3',
      }),

      // image cell
      cell(s.node('imageBlock', { src: 'http://x/y.png', alt: 'y', source: 'generated' }), {
        cellId: 'c4',
      }),

      // raw cell
      cell(s.node('rawBlock', { format: 'html' }, t('<b>raw</b>')), { cellId: 'c5' }),

      // table cell (prosemirror-tables family)
      cell(
        s.node('table', null, [
          s.node('table_row', null, [
            s.node('table_header', null, s.node('paragraph', null, t('H1'))),
            s.node('table_header', null, s.node('paragraph', null, t('H2'))),
          ]),
          s.node('table_row', null, [
            s.node('table_cell', null, s.node('paragraph', null, t('a'))),
            s.node('table_cell', null, s.node('paragraph', null, t('b'))),
          ]),
        ]),
        { cellId: 'c6' }
      ),
    ]);

    // check() throws if the content does not satisfy the schema
    expect(() => doc.check()).not.toThrow();
    expect(doc.childCount).toBe(7); // title + 6 cells

    // JSON round-trip must reproduce an identical doc
    const json = doc.toJSON();
    const back = s.nodeFromJSON(json);
    expect(back.eq(doc)).toBe(true);
  });

  it('rejects marks inside codeText (code is mark-free)', () => {
    expect(() => s.node('codeText', null, s.text('x', [s.mark('strong')])).check()).toThrow();
  });
});
