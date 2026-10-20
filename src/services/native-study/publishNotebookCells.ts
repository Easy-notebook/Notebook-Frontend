import useNotebookStore from '@Store/notebookStore';
import type { Cell } from '@Store/models';
import { AutoSaveService } from '@Services/autoSave';
import { NotebookActionScope } from '@Services/notebook/NotebookActionScope';

type PublishedCell = Partial<Cell> & { id: string; content: string };

/** One owned publication: prepare, insert once, persist, then acknowledge. */
export async function publishNotebookCells(
  notebookId: string,
  prepare: (signal: AbortSignal) => PublishedCell[] | Promise<PublishedCell[]>,
  options: { signal?: AbortSignal; requireUnedited?: boolean } = {}
): Promise<void> {
  const scope = new NotebookActionScope(options.signal);
  const owned = () => {
    if (useNotebookStore.getState().notebookId !== notebookId)
      throw new Error('笔记已切换，请重新打开研究');
    scope.signal.throwIfAborted();
  };
  try {
    owned();
    const cells = await prepare(scope.signal);
    owned();
    const save = AutoSaveService.getInstance();
    await save.initialize();
    owned();
    const store = useNotebookStore.getState();
    if (options.requireUnedited) {
      for (const cell of cells) {
        const existing = store.cells.find((item) => item.id === cell.id);
        if (
          existing &&
          (existing.type !== cell.type ||
            existing.language !== cell.language ||
            existing.content !== cell.content)
        )
          throw new Error('对应单元格已被编辑；请保留或移除该单元格后再插入，不会覆盖现有内容');
      }
    }
    for (const cell of cells) {
      owned();
      if (!useNotebookStore.getState().cells.some((item) => item.id === cell.id))
        store.addCell(cell);
    }
    owned();
    const updated = useNotebookStore.getState();
    await save.queueSave({
      notebookId,
      notebookTitle: updated.notebookTitle,
      cells: updated.cells,
      tasks: updated.tasks,
      timestamp: Date.now(),
    });
    await save.flush(notebookId);
    owned();
  } finally {
    scope.dispose();
  }
}
