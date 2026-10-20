import useNotebookStore from '@Store/notebookStore';
import { AutoSaveService } from '@Services/autoSave';
import type { NativeView } from './contracts';
import { studyMarkdown } from './studyExport';

/** Publish a stable snapshot once, then await the existing notebook persistence queue. */
export async function publishStudy(view: NativeView, notebookId: string): Promise<void> {
  const markdown = studyMarkdown(view);
  const save = AutoSaveService.getInstance();
  await save.initialize();
  const store = useNotebookStore.getState();
  if (store.notebookId !== notebookId) throw new Error('笔记已切换，请重新打开研究');
  const identity = `aal-study-${view.document.id}-${view.document.revision}`;
  const content = [markdown.split('\n')[0], markdown.slice(markdown.indexOf('\n') + 1).trim()];
  content.forEach((text, index) => {
    const id = `${identity}-${index}`;
    if (!store.cells.some((cell) => cell.id === id)) {
      store.addCell({
        id,
        type: 'markdown',
        content: text,
        metadata: {
          nativeStudy: { workspace: view.document.id, revision: view.document.revision },
        },
      });
    }
  });
  const updated = useNotebookStore.getState();
  await save.queueSave({
    notebookId,
    notebookTitle: updated.notebookTitle,
    cells: updated.cells,
    tasks: updated.tasks,
    timestamp: Date.now(),
  });
  await save.flush(notebookId);
}
