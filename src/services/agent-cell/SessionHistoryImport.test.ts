import { expect, it } from 'vitest';
import { sessionHistoryCells, type SessionHistory } from './SessionHistoryImport';
const history: SessionHistory = {
  info: {
    provider: 'codex',
    sessionId: '01900000-0000-7000-8000-000000000001',
    title: 'Example',
    cwd: '/project',
    updatedAt: 1,
  },
  messages: [
    { id: 'u', role: 'user', text: '分析数据' },
    {
      id: 'a',
      role: 'assistant',
      text: '正文\n\n```python\nprint(1)\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |',
    },
    {
      id: 't',
      role: 'tool',
      text: '{"command":"ls","output":"file"}',
      raw: { command: 'ls', output: 'file' },
    },
  ],
};
it('preserves user headings, prose, code, tables and folded tool metadata', () => {
  const cells = sessionHistoryCells(history);
  expect(cells[0].content).toBe('## 分析数据');
  expect(
    cells.some((c) => c.type === 'code' && c.content === 'print(1)' && c.language === 'python')
  ).toBe(true);
  expect(cells.some((c) => c.type === 'markdown' && c.content.includes('| A | B |'))).toBe(true);
  expect(cells.at(-1)?.metadata).toMatchObject({
    transcriptRole: 'tool',
    transcriptFormat: 2,
    sourceRecord: { command: 'ls', output: 'file' },
  });
});
it('uses stable source IDs for retry deduplication without executing imported code', () => {
  expect(sessionHistoryCells(history).map((c) => c.id)).toEqual(
    sessionHistoryCells(history).map((c) => c.id)
  );
  expect(sessionHistoryCells(history).every((c) => c.outputs?.length === 0)).toBe(true);
});
