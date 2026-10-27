import { it, expect, vi } from 'vitest';
import { NotebookContextService } from './NotebookContextService';
import type { IFileRepository } from '../persistence/interfaces';
import { statePath } from './model';

it('publishes only after the atomic file set succeeds and retains the previous context on conflict', async () => {
  const records = new Map<string, string>();
  const repo = {
    getFile: vi.fn(async (_notebook: string, path: string) =>
      records.has(path) ? { content: records.get(path) } : null
    ),
    saveFileSet: vi.fn(async (files, _options, condition) => {
      expect(condition.filePath).toBe(statePath);
      expect(condition.expectedContent).toBe(records.get(statePath) ?? null);
      for (const file of files) records.set(file.filePath, file.content);
    }),
  } as unknown as IFileRepository;
  const service = new NotebookContextService(repo);
  const source = {
    id: crypto.randomUUID(),
    notebookId: 'book',
    conversationId: 'session',
    messageId: 'turn',
    role: 'assistant' as const,
    text: 'Original evidence',
    capturedAt: 'now',
  };
  await service.capture(source, 'fact', 'Evidence', 0, 8);
  expect(service.snapshot('book')?.revision).toBe(1);
  expect(records.has('notebook-context/README.md')).toBe(true);
  vi.mocked(repo.saveFileSet).mockRejectedValueOnce(new Error('VERSION_CONFLICT'));
  await expect(
    service.capture({ ...source, id: crypto.randomUUID() }, 'lead', 'Clue', 9, 17)
  ).rejects.toThrow('VERSION_CONFLICT');
  expect(service.snapshot('book')?.entries).toHaveLength(1);
  const reopened = new NotebookContextService(repo);
  expect((await reopened.load('book')).entries[0].quote).toBe('Original');
  const context = await reopened.context('book');
  expect(context.facts[0].quote).toBe('Original');
});
