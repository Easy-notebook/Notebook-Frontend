import { describe, it, expect } from 'vitest';
import { parseMarkdown, serializeMarkdown } from '../NotebookSerializer';
import { NODE } from '../schema';

/**
 * Round-trip gate (docs/migration/03 §6). remark-stringify normalises markdown
 * (bullet markers, spacing), so the *first* serialize may differ from the input.
 * The invariant we prove is IDEMPOTENCE after one normalization pass:
 *   m1 = serialize(parse(M));  m2 = serialize(parse(m1));  =>  m1 === m2
 * and that the doc is stable: parse(m1) serializes back to m1.
 *
 * This is a STARTER corpus authored here. Hardening against real user notebooks
 * (the lossless gate) is the next step — see PROGRESS.md.
 */
const CORPUS: Record<string, string> = {
  'title + paragraph': `# My Notebook\n\nHello world.\n`,
  headings: `# T\n\n## Section A\n\n### Sub\n\nBody text.\n`,
  'inline marks': `# T\n\nThis is **bold**, *italic*, ~~struck~~, \`code\` and a [link](https://x.com).\n`,
  'bullet list': `# T\n\n- one\n- two\n- three\n`,
  'ordered list': `# T\n\n1. first\n2. second\n3. third\n`,
  'task list': `# T\n\n- [ ] todo\n- [x] done\n`,
  blockquote: `# T\n\n> quoted line\n`,
  'fenced code (code cell)': `# T\n\n\`\`\`python\nprint("hi")\n\`\`\`\n`,
  'block math': `# T\n\n$$\nE = mc^2\n$$\n`,
  'inline math': `# T\n\nEnergy is $E = mc^2$ exactly.\n`,
  'thematic break': `# T\n\nabove\n\n---\n\nbelow\n`,
  'gfm table aligned': `# T\n\n| Name | Age | City |\n| :--- | :-: | ---: |\n| Ann | 3 | NYC |\n| Bob | 40 | LA |\n`,
  'mixed cells': `# Report\n\nIntro paragraph.\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n## Results\n\n- a\n- b\n`,
};

describe('NotebookSerializer — markdown round-trip idempotence', () => {
  for (const [name, md] of Object.entries(CORPUS)) {
    it(`stable after normalization: ${name}`, () => {
      const m1 = serializeMarkdown(parseMarkdown(md));
      const m2 = serializeMarkdown(parseMarkdown(m1));
      expect(m2).toBe(m1);
      // doc produced from the normalized form is itself stable
      const m3 = serializeMarkdown(parseMarkdown(m2));
      expect(m3).toBe(m1);
    });
  }
});

describe('NotebookSerializer — fidelity', () => {
  it('parses the first H1 into the titleBlock', () => {
    const doc = parseMarkdown(`# Hello\n\nbody\n`);
    expect(doc.firstChild?.type.name).toBe(NODE.titleBlock);
    expect(doc.firstChild?.textContent).toBe('Hello');
  });

  it('turns a fenced code block into a codeCell with language', () => {
    const doc = parseMarkdown(`# T\n\n\`\`\`python\nprint(1)\n\`\`\`\n`);
    const codeCell = doc.child(1).firstChild;
    expect(codeCell?.type.name).toBe(NODE.codeCell);
    expect(codeCell?.attrs.language).toBe('python');
    expect(codeCell?.firstChild?.textContent).toBe('print(1)');
  });

  it('preserves GFM table column alignment through the round-trip', () => {
    const md = `# T\n\n| A | B | C |\n| :--- | :-: | ---: |\n| 1 | 2 | 3 |\n`;
    const out = serializeMarkdown(parseMarkdown(md));
    // alignment row must keep left / center / right markers
    expect(out).toMatch(/:-+\s*\|\s*:-+:\s*\|\s*-+:/);
  });

  it('keeps inline vs block math distinct', () => {
    const doc = parseMarkdown(`# T\n\nInline $a^2$ here.\n\n$$\nb^2\n$$\n`);
    // cell 1 = markdown paragraph with mathInline; a later cell = mathDisplay
    const para = doc.child(1).firstChild?.firstChild; // notebookCell > markdownBlock > paragraph
    expect(para?.type.name).toBe(NODE.paragraph);
    const hasInlineMath = (() => {
      let found = false;
      para?.descendants((n) => {
        if (n.type.name === NODE.mathInline) found = true;
      });
      return found;
    })();
    expect(hasInlineMath).toBe(true);
  });

  it('round-trips bold/italic/strike/code/link marks', () => {
    const md = `# T\n\n**b** *i* ~~s~~ \`c\` [l](https://x.com)\n`;
    const out = serializeMarkdown(parseMarkdown(md));
    expect(out).toContain('**b**');
    expect(out).toContain('*i*');
    expect(out).toContain('~~s~~');
    expect(out).toContain('`c`');
    expect(out).toContain('[l](https://x.com)');
  });
});
