import { describe, expect, it } from 'vitest';
import { highlightTree, classHighlighter } from '@lezer/highlight';
import { aalLanguage } from './aalLanguage';
import { codeLanguageExtensions } from './languageSupport';

describe('AAL syntax highlighting', () => {
  it('registers AAL and highlights native agent code, escaped strings and comments', () => {
    const source =
      'agent Cell is Agent\n  ability run() -> Any\n    return self.skill("numeric\\"segments", 3) # note';
    const tokens: Array<[string, string]> = [];
    highlightTree(aalLanguage.parser.parse(source), classHighlighter, (from, to, classes) => {
      tokens.push([source.slice(from, to), classes]);
    });
    expect(codeLanguageExtensions('aal')).toContain(aalLanguage);
    expect(tokens).toContainEqual(['agent', 'tok-keyword']);
    expect(tokens).toContainEqual(['Agent', 'tok-typeName']);
    expect(tokens).toContainEqual(['"numeric\\"segments"', 'tok-string']);
    expect(tokens).toContainEqual(['3', 'tok-number']);
    expect(tokens).toContainEqual(['# note', 'tok-comment']);
  });
});
