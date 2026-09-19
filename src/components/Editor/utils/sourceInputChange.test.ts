import { expect, it } from 'vitest';
import { sourceInputChange } from './sourceInputChange';
const input = { cancelable: true, isComposing: false, inputType: 'insertText', data: '中文🐍\r\n' };
it('normalizes inserted newlines and computes UTF-16 caret offsets', () => {
  expect(sourceInputChange(input, 3, 5)).toEqual({ from: 3, to: 5, insert: '中文🐍\n', cursor: 8, isolated: false });
});
it.each(['insertLineBreak', 'insertParagraph'])('maps %s without requiring event text', inputType => {
  expect(sourceInputChange({ ...input, inputType, data: null }, 2, 7)).toMatchObject({ insert: '\n', cursor: 3 });
});
it.each(['deleteContentBackward', 'deleteContentForward', 'deleteByCut'])('maps only explicit selection deletion for %s', inputType => {
  expect(sourceInputChange({ ...input, inputType }, 2, 7)).toEqual({ from: 2, to: 7, insert: '', cursor: 2, isolated: inputType === 'deleteByCut' });
  expect(sourceInputChange({ ...input, inputType }, 2, 2)).toBeUndefined();
});
it.each([
  { cancelable: false }, { isComposing: true }, { data: null },
  { inputType: 'insertFromPaste' }, { inputType: 'deleteWordBackward' }, { inputType: 'historyUndo' },
])('declines browser-owned or unsupported input: %o', overrides => {
  expect(sourceInputChange({ ...input, ...overrides }, 1, 4)).toBeUndefined();
});
