import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cellsToDoc,
  docToCells,
  legacySnapshotToDoc,
  parseMarkdown,
  serializeMarkdown,
} from '../NotebookSerializer';
import { CellLike } from '../ports';
import { NODE } from '../schema';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const template = JSON.parse(
  readFileSync(join(repoRoot, 'src/templates/templateNotebook.json'), 'utf8')
) as { notebook_id: string; cells: CellLike[] };

/** Re-normalize a markdown fragment the way the round-trip would. */
const normMd = (md: string) => serializeMarkdown(parseMarkdown(`# t\n\n${md}`));

describe('legacy Cell[] <-> doc interop against the real templateNotebook.json', () => {
  it('preserves cell count, ids, types, and flags through cells -> doc -> cells', () => {
    const doc = legacySnapshotToDoc(template);
    expect(() => doc.check()).not.toThrow();
    expect(doc.attrs.notebookId).toBe(template.notebook_id);

    const back = docToCells(doc);
    expect(back.length).toBe(template.cells.length);

    template.cells.forEach((orig, i) => {
      const got = back[i];
      expect(got.id, `cell ${i} id`).toBe(orig.id);
      expect(got.type, `cell ${i} type`).toBe(orig.type);
      expect(got.enableEdit, `cell ${i} enableEdit`).toBe(orig.enableEdit !== false);
      expect(got.phaseId ?? null, `cell ${i} phaseId`).toBe(orig.phaseId ?? null);
      expect(got.description ?? null, `cell ${i} description`).toBe(orig.description ?? null);
    });
  });

  it('keeps code-cell source verbatim', () => {
    const back = docToCells(legacySnapshotToDoc(template));
    template.cells.forEach((orig, i) => {
      if (orig.type === 'code') expect(back[i].content).toBe(orig.content);
    });
  });

  it('markdown-cell content is idempotent after one normalization pass', () => {
    const back = docToCells(legacySnapshotToDoc(template));
    template.cells.forEach((orig, i) => {
      if (orig.type !== 'markdown') return;
      const onceNormalized = back[i].content as string;
      // re-feeding the normalized content yields the same content
      const reDoc = cellsToDoc([{ id: 'x', type: 'markdown', content: onceNormalized }]);
      const reBack = docToCells(reDoc)[0].content as string;
      expect(reBack).toBe(onceNormalized);
    });
  });

  it('maps legacy output sentinels to structured status', () => {
    const doc = cellsToDoc([
      { id: 'ok', type: 'code', content: 'x', outputs: ['hello'] },
      { id: 'err', type: 'code', content: 'y', outputs: ['[error-message-for-debug]', 'boom'] },
      { id: 'empty', type: 'code', content: 'z', outputs: ['[without-output]'] },
    ]);
    const cells = docToCells(doc);
    expect(cells[0].outputs).toEqual(['hello']);
    expect(cells[1].outputs).toEqual(['[error-message-for-debug]', 'boom']);
    expect(cells[2].outputs).toEqual([]);
    // and the structured side
    const codeOk = doc.child(1).firstChild!;
    expect(codeOk.child(1).attrs.status).toBe('ok');
    expect(doc.child(2).firstChild!.child(1).attrs.status).toBe('error');
  });
});

describe('custom-block directive round-trip', () => {
  it('round-trips a :::thinking block losslessly', () => {
    const md = `# T\n\n:::thinking{agent="planner" state="done"}\nConsidering the split.\n:::\n`;
    const doc = parseMarkdown(md);
    const thinking = doc.child(1).firstChild;
    expect(thinking?.type.name).toBe(NODE.thinkingBlock);
    expect(thinking?.attrs.agentName).toBe('planner');
    expect(thinking?.attrs.phase).toBe('done');
    expect(thinking?.attrs.text).toContain('Considering the split');

    const out = serializeMarkdown(doc);
    expect(out).toContain(':::thinking');
    expect(out).toContain('agent="planner"');
    // stable on a second pass
    expect(serializeMarkdown(parseMarkdown(out))).toBe(out);
  });

  it('round-trips a :::raw block', () => {
    const md = `# T\n\n:::raw{format="html"}\n<b>hi</b>\n:::\n`;
    const doc = parseMarkdown(md);
    expect(doc.child(1).firstChild?.type.name).toBe(NODE.rawBlock);
    const out = serializeMarkdown(doc);
    expect(serializeMarkdown(parseMarkdown(out))).toBe(out);
  });
});
