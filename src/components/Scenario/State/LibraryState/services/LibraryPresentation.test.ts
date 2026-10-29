import { expect, it } from 'vitest';
import { libraryPresentation } from './LibraryPresentation';
it('identifies providers from persisted Agent metadata, never from titles', () => {
  expect(libraryPresentation({ title: 'Claude Code' }).providers).toEqual([]);
  const result = libraryPresentation({
    cells: [
      {
        type: 'agent',
        metadata: { agent: { provider: 'claude', turns: [{ prompt: 'Actual request' }] } },
      },
      { type: 'agent', metadata: { agent: { provider: 'codex' } } },
      { type: 'agent', metadata: { agent: { provider: 'claude' } } },
    ],
  });
  expect(result.providers).toEqual(['claude', 'codex']);
  expect(result.kind).toBe('chat');
  expect(result.preview).toBe('Actual request');
});
it('uses explicit types while retaining provenance', () => {
  expect(libraryPresentation({ cells: [{ type: 'code', content: 'print(1)' }] }).kind).toBe(
    'project'
  );
  expect(libraryPresentation({ cells: [{ type: 'code' }] }, 'document').kind).toBe('document');
  expect(libraryPresentation(null).kind).toBe('document');
});
it('bounds preview size and accepts markdown snapshots', () => {
  expect(
    libraryPresentation({
      cells: [{ cell_type: 'markdown', source: ['# Hello\n', 'x'.repeat(1000)] }],
    }).preview
  ).toHaveLength(260);
});
