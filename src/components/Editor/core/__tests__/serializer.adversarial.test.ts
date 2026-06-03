import { describe, it, expect } from 'vitest';
import {
  parseMarkdown,
  serializeMarkdown,
  cellsToDoc,
  docToCells,
  fromCells,
  toCells,
  toJSON,
  fromJSON,
  legacySnapshotToDoc,
} from '../NotebookSerializer';
import { notebookSchema, NODE } from '../schema';
import { CellLike } from '../ports';

/**
 * Adversarial markdown corpus + legacy Cell[] parity for the hardened
 * NotebookSerializer (Phase 2). Covers every edgeCase from the fixtures spec:
 * escaping/injection, table pipes & alignment, nested/ordered/task lists, math
 * edges, frontmatter, custom directive blocks, plus the legacy interop contract.
 *
 * Gate invariant: m1 = serialize(parse(M)); m2 = serialize(parse(m1));
 * assert m2 === m1 and parse(m1) re-serializes to m1 (a fixed point).
 */

/** Assert markdown is a fixed point after one normalization pass. */
function expectFixedPoint(md: string) {
  const m1 = serializeMarkdown(parseMarkdown(md));
  const m2 = serializeMarkdown(parseMarkdown(m1));
  expect(m2).toBe(m1);
  return m1;
}

// ---------------------------------------------------------------------------
// Escaping / injection
// ---------------------------------------------------------------------------
describe('escaping & injection safety', () => {
  it('round-trips raw < & " * _ literally without malformed output', () => {
    const md = `# T\n\nLess < than, amp & sand, "quote", star \\* and under \\_ stay.\n`;
    const m1 = expectFixedPoint(md);
    // re-parsing m1 yields the literal characters in text
    const doc = parseMarkdown(m1);
    const text = doc.child(1).textContent;
    expect(text).toContain('<');
    expect(text).toContain('&');
  });

  it('routes a top-level <script> / block <div> HTML to a rawBlock (not dropped)', () => {
    const md = `# T\n\n<div class="x"><script>alert(1)</script></div>\n`;
    const doc = parseMarkdown(md);
    const body = doc.child(1).firstChild;
    expect(body?.type.name).toBe(NODE.rawBlock);
    expect(body?.attrs.format).toBe('html');
    expect(body?.textContent).toContain('<script>');
    // and it survives the round-trip
    const out = serializeMarkdown(doc);
    expect(out).toContain('<script>');
    expect(serializeMarkdown(parseMarkdown(out))).toBe(out);
  });
});

// ---------------------------------------------------------------------------
// Tables: pipes, inline code, ragged rows, alignments
// ---------------------------------------------------------------------------
describe('tables', () => {
  it('preserves all four column alignments', () => {
    const md = `# T\n\n| L | C | R | D |\n| :--- | :-: | ---: | --- |\n| 1 | 2 | 3 | 4 |\n`;
    const doc = parseMarkdown(md);
    const table = doc.child(1).firstChild!;
    const headerRow = table.firstChild!;
    expect(headerRow.child(0).attrs.align).toBe('left');
    expect(headerRow.child(1).attrs.align).toBe('center');
    expect(headerRow.child(2).attrs.align).toBe('right');
    expect(headerRow.child(3).attrs.align ?? null).toBe(null);
    const out = serializeMarkdown(doc);
    expect(out).toMatch(/:-+\s*\|\s*:-+:\s*\|\s*-+:/);
    expect(serializeMarkdown(parseMarkdown(out))).toBe(out);
  });

  it('keeps escaped pipes (incl. inside inline code) in one cell per GFM', () => {
    // GFM requires pipes inside a table cell to be escaped, even within code.
    const md = `# T\n\n| A | B |\n| --- | --- |\n| a \\| b | \`c \\| d\` |\n`;
    const doc = parseMarkdown(md);
    const table = doc.child(1).firstChild!;
    const dataRow = table.child(1);
    // two cells, not split on the escaped pipes
    expect(dataRow.childCount).toBe(2);
    expectFixedPoint(md);
  });

  it('normalizes ragged rows to a fixed point', () => {
    const md = `# T\n\n| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |\n`;
    expectFixedPoint(md);
  });
});

// ---------------------------------------------------------------------------
// Lists: nested, ordered, task, blockquote depth
// ---------------------------------------------------------------------------
describe('lists & blockquotes', () => {
  it('round-trips nested bullet lists', () => {
    expectFixedPoint(`# T\n\n- a\n  - a1\n  - a2\n- b\n`);
  });

  it('round-trips an ordered list with a non-1 start', () => {
    const md = `# T\n\n3. three\n4. four\n5. five\n`;
    const doc = parseMarkdown(md);
    const list = doc.child(1).firstChild!.firstChild!;
    expect(list.type.name).toBe(NODE.orderedList);
    expect(list.attrs.start).toBe(3);
    expectFixedPoint(md);
  });

  it('round-trips a GFM task list with checkbox state', () => {
    const md = `# T\n\n- [ ] todo\n- [x] done\n`;
    const doc = parseMarkdown(md);
    const list = doc.child(1).firstChild!.firstChild!;
    expect(list.child(0).attrs.checked).toBe(false);
    expect(list.child(1).attrs.checked).toBe(true);
    expectFixedPoint(md);
  });

  it('round-trips blockquotes nested three levels', () => {
    expectFixedPoint(`# T\n\n> a\n>\n> > b\n> >\n> > > c\n`);
  });
});

// ---------------------------------------------------------------------------
// Code fences
// ---------------------------------------------------------------------------
describe('code fences', () => {
  it('a top-level fenced block becomes a codeCell', () => {
    const doc = parseMarkdown(`# T\n\n\`\`\`python\nprint(1)\n\`\`\`\n`);
    expect(doc.child(1).firstChild?.type.name).toBe(NODE.codeCell);
  });

  it('fenced code nested in a blockquote becomes a codeBlock (not a codeCell)', () => {
    const md = `# T\n\n> \`\`\`python\n> x = 1\n> \`\`\`\n`;
    const doc = parseMarkdown(md);
    const bq = doc.child(1).firstChild!.firstChild!;
    expect(bq.type.name).toBe(NODE.blockquote);
    expect(bq.firstChild?.type.name).toBe(NODE.codeBlock);
    expectFixedPoint(md);
  });

  it('a code cell whose first line is ## stays verbatim', () => {
    const md = `# T\n\n\`\`\`python\n## not a heading\nprint(1)\n\`\`\`\n`;
    const doc = parseMarkdown(md);
    expect(doc.child(1).firstChild?.firstChild?.textContent).toBe('## not a heading\nprint(1)');
    expectFixedPoint(md);
  });
});

// ---------------------------------------------------------------------------
// Math edges
// ---------------------------------------------------------------------------
describe('math', () => {
  it('single-dollar alone stays inline, not promoted to block', () => {
    const md = `# T\n\n$a^2$\n`;
    const doc = parseMarkdown(md);
    const para = doc.child(1).firstChild!.firstChild!;
    expect(para.type.name).toBe(NODE.paragraph);
    let inline = false;
    para.descendants((n) => {
      if (n.type.name === NODE.mathInline) inline = true;
    });
    expect(inline).toBe(true);
    expectFixedPoint(md);
  });

  it('double-dollar is block math', () => {
    const md = `# T\n\n$$\nb^2\n$$\n`;
    const doc = parseMarkdown(md);
    expect(doc.child(1).firstChild?.firstChild?.type.name).toBe(NODE.mathDisplay);
    expectFixedPoint(md);
  });

  it('a $ price is not math and round-trips', () => {
    expectFixedPoint(`# T\n\nIt costs $5 and $10 dollars.\n`);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------
describe('frontmatter', () => {
  it('captures multiline YAML into notebook.meta.raw before the H1', () => {
    const md = `---\ntitle: Demo\ntags:\n  - a\n  - b\n---\n\n# Real Title\n\nbody\n`;
    const doc = parseMarkdown(md);
    expect((doc.attrs.meta as { raw?: string }).raw).toContain('title: Demo');
    expect(doc.firstChild?.type.name).toBe(NODE.titleBlock);
    expect(doc.firstChild?.textContent).toBe('Real Title');
    expectFixedPoint(md);
  });

  it('frontmatter with no H1 yields a default titleBlock', () => {
    const md = `---\ntitle: Demo\n---\n\nbody only\n`;
    const doc = parseMarkdown(md);
    expect(doc.firstChild?.attrs.isDefault).toBe(true);
  });

  it('a leading thematic break is NOT frontmatter', () => {
    const md = `# T\n\nabove\n\n---\n\nbelow\n`;
    const doc = parseMarkdown(md);
    expect((doc.attrs.meta as { raw?: string }).raw).toBeUndefined();
    expectFixedPoint(md);
  });
});

// ---------------------------------------------------------------------------
// Inline images vs image directive (idempotence requirement)
// ---------------------------------------------------------------------------
describe('images', () => {
  it('a plain markdown image round-trips as an inline image (not imageBlock)', () => {
    const md = `# T\n\nHere ![alt](https://x.com/a.png) inline.\n`;
    const doc = parseMarkdown(md);
    const para = doc.child(1).firstChild!.firstChild!;
    let inlineImg: ReturnType<typeof parseMarkdown> | null = null;
    para.descendants((n) => {
      if (n.type.name === NODE.inlineImage) inlineImg = n as never;
    });
    expect(inlineImg).not.toBeNull();
    expectFixedPoint(md);
  });

  it('an :::image directive becomes an imageBlock and round-trips', () => {
    const md = `# T\n\n:::image{src="blob:1" alt="chart"}\n:::\n`;
    const doc = parseMarkdown(md);
    expect(doc.child(1).firstChild?.type.name).toBe(NODE.imageBlock);
    expect(doc.child(1).firstChild?.attrs.src).toBe('blob:1');
    const out = serializeMarkdown(doc);
    expect(out).toContain(':::image');
    expect(serializeMarkdown(parseMarkdown(out))).toBe(out);
  });
});

// ---------------------------------------------------------------------------
// Custom directive blocks
// ---------------------------------------------------------------------------
describe('custom directive blocks', () => {
  it('an unknown directive falls back to a verbatim rawBlock (not dropped)', () => {
    const md = `# T\n\n:::weird{foo="bar"}\nsome body text\n:::\n`;
    const doc = parseMarkdown(md);
    expect(doc.child(1).firstChild?.type.name).toBe(NODE.rawBlock);
    expect(doc.child(1).firstChild?.textContent).toContain('some body text');
  });

  it('thinking keeps attrs and survives a round-trip', () => {
    const md = `# T\n\n:::thinking{agent="planner" state="done"}\nplanning...\n:::\n`;
    const doc = parseMarkdown(md);
    const tb = doc.child(1).firstChild!;
    expect(tb.attrs.agentName).toBe('planner');
    expect(tb.attrs.phase).toBe('done');
    const out = serializeMarkdown(doc);
    expect(serializeMarkdown(parseMarkdown(out))).toBe(out);
  });
});

// ---------------------------------------------------------------------------
// Persistence codec
// ---------------------------------------------------------------------------
describe('persistence codec (toJSON / fromJSON)', () => {
  it('round-trips a doc through PM JSON losslessly', () => {
    const doc = parseMarkdown(`# T\n\nbody **bold**\n\n\`\`\`python\nprint(1)\n\`\`\`\n`);
    const json = toJSON(doc);
    expect(json.schemaVersion).toBe(2);
    const back = fromJSON(json);
    expect(back.eq(doc)).toBe(true);
  });

  it('accepts a bare PM-JSON doc object', () => {
    const doc = parseMarkdown(`# T\n\nhi\n`);
    const back = fromJSON(doc.toJSON());
    expect(back.eq(doc)).toBe(true);
  });

  it('preserves outputs through PM JSON', () => {
    const doc = cellsToDoc([{ id: 'a', type: 'code', content: 'x', outputs: ['hello'] }]);
    const back = fromJSON(toJSON(doc));
    const ob = back.child(1).firstChild!.child(1);
    expect(ob.attrs.status).toBe('ok');
    expect((ob.attrs.items as { data: string }[])[0].data).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Legacy Cell[] parity
// ---------------------------------------------------------------------------
describe('legacy Cell[] parity', () => {
  const cells: CellLike[] = [
    { id: 'm1', type: 'markdown', content: '# Heading\n\ntext', phaseId: 'p1', description: 'd' },
    {
      id: 'c1',
      type: 'code',
      content: 'print(1)',
      outputs: ['out'],
      enableEdit: false,
      metadata: { language: 'python', executionCount: 3 },
    },
    { id: 'r1', type: 'raw', content: '<x/>' },
    {
      id: 't1',
      type: 'thinking',
      content: 'pondering',
      metadata: { agentName: 'AI', phase: 'done' },
    },
  ];

  it('fromCells then toCells preserves id/type/outputs/status/phaseId/enableEdit', () => {
    const back = toCells(fromCells(cells));
    expect(back.length).toBe(cells.length);
    expect(back[0].id).toBe('m1');
    expect(back[0].phaseId).toBe('p1');
    expect(back[0].description).toBe('d');
    expect(back[1].id).toBe('c1');
    expect(back[1].type).toBe('code');
    expect(back[1].outputs).toEqual(['out']);
    expect(back[1].enableEdit).toBe(false);
    expect((back[1].metadata as Record<string, unknown>).language).toBe('python');
    expect((back[1].metadata as Record<string, unknown>).executionCount).toBe(3);
    expect(back[2].type).toBe('raw');
    expect(back[2].content).toBe('<x/>');
    expect(back[3].type).toBe('thinking');
    expect(back[3].content).toBe('pondering');
    expect((back[3].metadata as Record<string, unknown>).agentName).toBe('AI');
  });

  it('toCells then fromCells is structurally stable', () => {
    const doc1 = fromCells(cells);
    const doc2 = fromCells(toCells(doc1));
    expect(doc2.eq(doc1)).toBe(true);
  });

  it('maps sentinels to structured status and reconstructs them on toCells', () => {
    const doc = cellsToDoc([
      { id: 'ok', type: 'code', content: 'a', outputs: ['hi'] },
      { id: 'err', type: 'code', content: 'b', outputs: ['[error-message-for-debug]', 'boom'] },
      { id: 'empty', type: 'code', content: 'c', outputs: ['[without-output]'] },
    ]);
    expect(doc.child(1).firstChild!.child(1).attrs.status).toBe('ok');
    expect(doc.child(2).firstChild!.child(1).attrs.status).toBe('error');
    // empty -> no outputBlock
    expect(doc.child(3).firstChild!.childCount).toBe(1);
    const back = docToCells(doc);
    expect(back[0].outputs).toEqual(['hi']);
    expect(back[1].outputs).toEqual(['[error-message-for-debug]', 'boom']);
    expect(back[2].outputs).toEqual([]);
  });

  it('decomposes a hybrid cell into an adjacent markdownBlock + codeCell', () => {
    const doc = cellsToDoc([
      {
        id: 'h1',
        type: 'hybrid',
        content: 'print(2)',
        metadata: { markdown: '## prose half' },
      },
    ]);
    // titleBlock + 2 cells
    const cell0 = doc.child(1);
    const cell1 = doc.child(2);
    expect(cell0.firstChild?.type.name).toBe(NODE.markdownBlock);
    expect(cell0.attrs.cellId).toBe('h1');
    expect(cell1.firstChild?.type.name).toBe(NODE.codeCell);
    expect(cell1.attrs.cellId).toBe('h1-code');
    expect(cell1.firstChild?.firstChild?.textContent).toBe('print(2)');
  });

  it('maps a link cell to a markdownBlock carrying a link mark', () => {
    const doc = cellsToDoc([{ id: 'l1', type: 'link', content: '[label](https://x.com)' }]);
    const body = doc.child(1).firstChild!;
    expect(body.type.name).toBe(NODE.markdownBlock);
    let hasLink = false;
    body.descendants((n) => {
      n.marks.forEach((m) => {
        if (m.type.name === 'link') hasLink = true;
      });
    });
    expect(hasLink).toBe(true);
  });

  it('legacySnapshotToDoc reads a { cells, tasks } snapshot via fromCells', () => {
    const doc = legacySnapshotToDoc({
      notebook_id: 'nb-1',
      cells: [{ id: 'a', type: 'markdown', content: 'hi' }],
      tasks: [],
    });
    expect(doc.attrs.notebookId).toBe('nb-1');
    expect(() => doc.check()).not.toThrow();
  });

  it('produces a schema-valid doc for every legacy type', () => {
    const doc = fromCells([
      { id: '1', type: 'markdown', content: 'm' },
      { id: '2', type: 'code', content: 'c', outputs: ['o'] },
      { id: '3', type: 'raw', content: 'r' },
      { id: '4', type: 'image', content: 'http://x/i.png' },
      { id: '5', type: 'thinking', content: 'think' },
      { id: '6', type: 'link', content: '[l](http://x)' },
      { id: '7', type: 'hybrid', content: 'code', metadata: { markdown: 'prose' } },
    ]);
    expect(() => doc.check()).not.toThrow();
    expect(notebookSchema.nodeFromJSON(doc.toJSON()).eq(doc)).toBe(true);
  });
});
