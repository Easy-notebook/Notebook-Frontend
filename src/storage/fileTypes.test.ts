import { expect, it } from 'vitest';
import { getFileType, getActivePreviewMode, getPreviewFileType, getMimeType } from './fileTypes';

it.each(['ts', 'json', '.ts', '/directory.ts/file', 'C:\\directory.ts\\file'])('does not invent an extension for %s', name => {
  expect(getPreviewFileType(name, 'text')).toBe('text');
  expect(getMimeType(name)).toBe('application/octet-stream');
});
it.each(['/directory.v1/file.TS', 'C:\\directory.v1\\file.TS', '.hidden.TS'])('recognizes only the basename extension in %s', name => {
  expect(getFileType(name)).toBe('typescript');
  expect(getMimeType(name)).toBe('text/plain');
});

it.each(['example.ts', 'types.d.ts', 'EXAMPLE.TS'])('routes %s to TypeScript code preview', name => {
  expect(getFileType(name)).toBe('typescript');
  expect(getPreviewFileType(name, 'javascript')).toBe('typescript');
  expect(getActivePreviewMode(getFileType(name))).toBe('code');
});
it.each([['file.js', 'javascript'], ['file.py', 'python'], ['file.md', 'markdown'], ['file.xlsx', 'xlsx'], ['file.tsx', 'jsx']] as const)('preserves known routing for %s', (name, expected) => {
  expect(getPreviewFileType(name, 'text')).toBe(expected);
});
it('retains declared types for extensionless and unknown files', () => {
  expect(getPreviewFileType('Notebook', 'notebook')).toBe('notebook');
  expect(getPreviewFileType('file.custom', 'python')).toBe('python');
});
