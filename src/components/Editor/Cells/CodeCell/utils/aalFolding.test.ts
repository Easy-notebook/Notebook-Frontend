import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { foldable, codeFolding, foldEffect, foldedRanges } from '@codemirror/language';
import { codeLanguageExtensions } from './languageSupport';
function state(source: string) {
  return EditorState.create({
    doc: source,
    extensions: [...codeLanguageExtensions('aal'), codeFolding()],
  });
}
function range(s: EditorState, n: number) {
  const line = s.doc.line(n);
  return foldable(s, line.from, line.to);
}
describe('AAL suite folding', () => {
  it('folds nested agents, memory and abilities without swallowing siblings', () => {
    const s = state(
      'agent A is Agent\n  memory scope "workspace" strict\n    value: Any\n  public\n    ability run() -> Any\n      return 1\nagent B is Agent\n  role "B"'
    );
    expect(range(s, 1)?.to).toBe(s.doc.line(6).to);
    expect(range(s, 2)?.to).toBe(s.doc.line(3).to);
    expect(range(s, 5)).toEqual({ from: s.doc.line(5).to, to: s.doc.line(6).to });
    expect(range(s, 6)).toBeNull();
    const folded = s.update({ effects: foldEffect.of(range(s, 5)!) }).state;
    expect(foldedRanges(folded).size).toBe(1);
  });
  it('ignores comment indentation and bracket continuations, including brackets inside strings', () => {
    const s = state(
      'agent A is Agent\n  role "[ # escaped \\" quote"\n  memory scope "workspace" strict\n    value: Any = [\n      1,\n      2\n    ]\n\n# comment\n  public\n    ability run() -> Any\n      return 1'
    );
    expect(range(s, 2)).toBeNull();
    expect(range(s, 4)).toBeNull();
    expect(range(s, 3)?.to).toBe(s.doc.line(7).to);
  });
  it('reindexes after edits', () => {
    const s = state('agent A is Agent\n  role "A"');
    const changed = s.update({
      changes: { from: s.doc.length, insert: '\nagent B is Agent\n  role "B"' },
    }).state;
    expect(range(changed, 1)?.to).toBe(changed.doc.line(2).to);
    expect(range(changed, 3)?.to).toBe(changed.doc.line(4).to);
  });
});
