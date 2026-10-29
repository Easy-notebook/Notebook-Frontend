import { expect, it, vi } from 'vitest';
import { NotebookCreation } from './NotebookCreation';
import type { IPersistenceService } from '@Services/persistence/interfaces';
function fixture() {
  const save = vi.fn(async () => {});
  const tabs = vi.fn(async () => {});
  const initialize = vi.fn(async () => {});
  const service = {
    initialize,
    notebooks: { saveNotebookSnapshot: save },
    tabs: { saveTabState: tabs },
  } as unknown as IPersistenceService;
  return { save, tabs, initialize, creator: new NotebookCreation(service) };
}
it('persists a complete loadable document and empty file tabs before returning its ID', async () => {
  const { creator, save, tabs } = fixture();
  const id = await creator.create();
  const [file, notebook] = save.mock.calls[0] as unknown as [
    { content: string; filePath: string },
    { id: string },
  ];
  expect(notebook.id).toBe(id);
  expect(file.filePath).toBe(`notebook_${id}.json`);
  expect(JSON.parse(file.content)).toMatchObject({
    notebook_id: id,
    title: 'Untitled',
    cells: [{ type: 'markdown', content: '# Untitled', metadata: { isDefaultTitle: true } }],
    tasks: [],
  });
  expect(tabs).toHaveBeenCalledWith(id, [], null);
  expect(save.mock.invocationCallOrder[0]).toBeLessThan(tabs.mock.invocationCallOrder[0]);
});
it('does not report success when persistence fails', async () => {
  const { creator, save, tabs } = fixture();
  save.mockRejectedValueOnce(new Error('storage full'));
  await expect(creator.create()).rejects.toThrow('storage full');
  expect(tabs).not.toHaveBeenCalled();
});
it('creates independent notebooks for independent requests', async () => {
  const { creator } = fixture();
  const [a, b] = await Promise.all([creator.create(), creator.create()]);
  expect(a).not.toBe(b);
});

it('persists imported cells with their metadata and title instead of a default title cell', async () => {
  const { creator, save } = fixture();
  const cells = [{ id: 'turn-1', type: 'markdown' as const, content: '**Claude**\n\nHello',
    metadata: { importSource: 'claude-code', transcriptRole: 'assistant' } }];
  await creator.create('Conversation', cells);
  const [file] = save.mock.calls[0] as unknown as [{ content: string }];
  expect(JSON.parse(file.content)).toMatchObject({ title: 'Conversation', cells, tasks: [] });
});
