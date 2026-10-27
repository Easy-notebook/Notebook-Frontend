import { expect, it } from 'vitest';
import { makeFileId, parseFileId } from './fileIdentity';

it.each([
  ' report.txt',
  'report.txt ',
  ' folder/中文 #1.txt ',
  'a::b.txt',
  'literal%2Fname.txt',
  'a\\b.txt',
  '🧪.txt',
])('preserves the exact path %j across persistence and restoration', (filePath) => {
  const id = makeFileId('book', filePath);
  expect(id).toBe(`book::${filePath}`);
  expect(parseFileId(id)).toEqual({ notebookId: 'book', filePath });
});

it.each(['', 'book', '::file.txt', 'book::'])('rejects incomplete identity %j', (id) => {
  expect(parseFileId(id)).toBeNull();
});
