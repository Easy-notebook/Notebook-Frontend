import { describe, expect, it } from 'vitest';
import { CellModel } from '@Store/models/cell';
import { canExecuteCodeLanguage, normalizeCodeLanguage } from '@Store/models/codeLanguage';
import { codeLanguageExtensions } from './languageSupport';
import { HybridCellViewModel } from '../../HybridCell/model/HybridCellViewModel';

describe('code-cell language contract', () => {
  it('defaults unspecified code languages, including hybrid fences, to Python', () => {
    expect(normalizeCodeLanguage()).toBe('python');
    expect(normalizeCodeLanguage('')).toBe('python');
    const cell = new HybridCellViewModel({
      id: 'hybrid',
      type: 'hybrid',
      content: '```\nprint(1)\n```',
      outputs: [],
    });
    expect(cell.contentType).toMatchObject({ type: 'code', language: 'python' });
  });
  it('keeps the language across the Cell model round trip', () => {
    const cell = CellModel.fromJSON({
      id: 'js',
      type: 'code',
      content: 'const x = 1',
      language: 'javascript',
    });
    expect(cell.toJSON()).toMatchObject({ language: 'javascript' });
  });

  it('selects syntax support without claiming unsupported execution', () => {
    expect(normalizeCodeLanguage('js')).toBe('javascript');
    expect(codeLanguageExtensions('js')).toBe(codeLanguageExtensions('javascript'));
    expect(codeLanguageExtensions('typescript')).not.toBe(codeLanguageExtensions('python'));
    expect(codeLanguageExtensions('bash')).toEqual([]);
    expect(canExecuteCodeLanguage('python')).toBe(true);
    expect(canExecuteCodeLanguage('javascript')).toBe(false);
    expect(canExecuteCodeLanguage('bash')).toBe(false);
  });
});
