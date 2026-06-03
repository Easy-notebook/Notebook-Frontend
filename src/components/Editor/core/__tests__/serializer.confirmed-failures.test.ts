import { describe, it, expect } from 'vitest';
import { parseMarkdown, serializeMarkdown, toCells, fromCells } from '../NotebookSerializer';
import { NODE } from '../schema';
import type { CellLike } from '../ports';

/**
 * Permanent regression suite pinning the ten adversarially-confirmed Phase 2
 * NotebookSerializer failures. Each `it` reproduces one verification finding and
 * asserts the fixed (lossless / verbatim) behaviour required by
 * docs/migration/03 §7.
 */

describe('confirmed failures — raw HTML & directive lossless round-trip', () => {
  it('#1 html rawBlock survives the legacy toCells/fromCells projection round-trip', () => {
    const M = '<div>raw & <unsafe></div>';
    const doc = parseMarkdown(M);
    const cells = toCells(doc);
    const back = fromCells(cells);
    expect(serializeMarkdown(back)).toBe(serializeMarkdown(doc));
    // verbatim HTML, not re-wrapped in a directive
    expect(serializeMarkdown(doc)).toContain('<div>raw & <unsafe></div>');
    expect(serializeMarkdown(back)).not.toContain(':::raw');
  });

  it('#1b the legacy "raw" cell carries the html format across the projection', () => {
    const doc = parseMarkdown('<div>x</div>');
    const cell = toCells(doc)[0];
    expect(cell.type).toBe('raw');
    // format must be preserved (not flipped to markdown)
    expect((cell.metadata as Record<string, unknown> | null)?.format ?? 'html').toBe('html');
    const back = fromCells([cell]);
    expect(back.child(1).firstChild?.attrs.format).toBe('html');
  });

  it('#2 :::raw{format="html"} content is preserved, not dropped', () => {
    const md = '# T\n\n:::raw{format="html"}\n<iframe src="https://example.com"></iframe>\n:::\n';
    const doc = parseMarkdown(md);
    const raw = doc.child(1).firstChild;
    expect(raw?.type.name).toBe(NODE.rawBlock);
    expect(raw?.attrs.format).toBe('html');
    expect(raw?.textContent).toContain('<iframe src="https://example.com"></iframe>');
    const out = serializeMarkdown(doc);
    expect(out).toContain('<iframe src="https://example.com"></iframe>');
    expect(out).not.toBe('# T\n\n');
  });

  it('#4 :::raw{format="markdown"} keeps inline markdown markers verbatim', () => {
    const md = '# T\n\n:::raw{format="markdown"}\nsome **raw** text\n:::\n';
    const doc = parseMarkdown(md);
    expect(doc.child(1).firstChild?.textContent).toContain('some **raw** text');
    const out = serializeMarkdown(doc);
    expect(out).toContain('some **raw** text');
  });

  it('#5 unknown directive (:::attachment) preserves name + all attributes', () => {
    const md = '# T\n\n:::attachment{fileId="f1" name="data.csv"}\n:::\n';
    const out = serializeMarkdown(parseMarkdown(md));
    expect(out).toContain('attachment');
    expect(out).toContain('fileId="f1"');
    expect(out).toContain('name="data.csv"');
    // fixed point
    expect(serializeMarkdown(parseMarkdown(out))).toBe(out);
  });

  it('#6 :::thinking multi-paragraph body keeps the blank line between paragraphs', () => {
    const md = '# T\n\n:::thinking{agent="a"}\nfirst paragraph\n\nsecond paragraph\n:::\n';
    const out = serializeMarkdown(parseMarkdown(md));
    expect(out).toMatch(/first paragraph\n\nsecond paragraph/);
  });
});

describe('confirmed failures — generated image directive', () => {
  it('#3 image src + generationParams JSON survive serialize and stay a valid directive', () => {
    const cells: CellLike[] = [
      {
        id: 'img1',
        type: 'image',
        content: 'blob:abc',
        metadata: { generationParams: { model: 'dalle', seed: 42 } },
      },
    ];
    const pm = fromCells(cells);
    const m1 = serializeMarkdown(pm);
    expect(m1).toContain('blob:abc');
    expect(m1).toContain(':::image');
    expect(m1).not.toContain('\\:::');
    // fixed point and lossless round-trip of src + params
    const m2 = serializeMarkdown(parseMarkdown(m1));
    expect(m2).toBe(m1);
    const reparsed = parseMarkdown(m1);
    const imgCell = reparsed.child(1).firstChild;
    expect(imgCell?.type.name).toBe(NODE.imageBlock);
    expect(imgCell?.attrs.src).toBe('blob:abc');
    expect(imgCell?.attrs.generationParams).toEqual({ model: 'dalle', seed: 42 });
  });
});

describe('confirmed failures — legacy OutputItem[] fidelity', () => {
  it('#7 object text OutputItem round-trips through fromCells -> toCells', () => {
    const out = toCells(
      fromCells([
        {
          id: 'c',
          type: 'code',
          content: 'print(1)',
          outputs: [{ type: 'text', content: 'hello\n' }],
        },
      ])
    );
    expect(out[0].outputs?.[0]).toEqual({ type: 'text', content: 'hello\n' });
  });

  it('#8 structured image/MIME OutputItem round-trips', () => {
    const out = toCells(
      fromCells([
        {
          id: 'c',
          type: 'code',
          content: 'plot()',
          outputs: [{ type: 'image', content: { mime: 'image/png', data: 'iVBOR...' } }],
        },
      ])
    );
    expect(out[0].outputs?.[0]).toEqual({
      type: 'image',
      content: { mime: 'image/png', data: 'iVBOR...' },
    });
  });

  it('#9 error-typed OutputItem preserves its error identity', () => {
    const out = toCells(
      fromCells([
        {
          id: 'c',
          type: 'code',
          content: 'boom',
          outputs: [{ type: 'error', content: 'Traceback (most recent call last)...' }],
        },
      ])
    );
    expect(out[0].outputs?.[0]).toEqual({
      type: 'error',
      content: 'Traceback (most recent call last)...',
    });
  });

  it('legacy string[] outputs still round-trip (no regression)', () => {
    const out = toCells(
      fromCells([{ id: 'c', type: 'code', content: 'print(1)', outputs: ['hello\n'] }])
    );
    expect(out[0].outputs?.[0]).toEqual('hello\n');
  });

  it('legacy string[] error sentinel still round-trips (no regression)', () => {
    const out = toCells(
      fromCells([
        {
          id: 'c',
          type: 'code',
          content: 'boom',
          outputs: ['[error-message-for-debug]', 'Traceback...'],
        },
      ])
    );
    expect(out[0].outputs).toEqual(['[error-message-for-debug]', 'Traceback...']);
  });
});

describe('confirmed failures — nested list parsing', () => {
  it('#10 list item whose first child is a sublist does not crash and round-trips', () => {
    expect(() => parseMarkdown('- - x\n')).not.toThrow();
    const m1 = serializeMarkdown(parseMarkdown('- - x\n'));
    const m2 = serializeMarkdown(parseMarkdown(m1));
    expect(m2).toBe(m1);
    expect(m1).toContain('x');
  });

  it('#10b ordered nested sublist as first child does not crash', () => {
    expect(() => parseMarkdown('1. \n   1. inner\n')).not.toThrow();
    const m1 = serializeMarkdown(parseMarkdown('1. \n   1. inner\n'));
    expect(m1).toContain('inner');
  });
});
