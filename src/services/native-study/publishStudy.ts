import type { NativeView } from './contracts';
import { studyMarkdown } from './studyExport';
import { publishNotebookCells } from './publishNotebookCells';

/** Publish a stable snapshot once, then await the existing notebook persistence queue. */
export async function publishStudy(
  view: NativeView,
  notebookId: string,
  signal?: AbortSignal
): Promise<void> {
  const markdown = studyMarkdown(view);
  const identity = `aal-study-${view.document.id}-${view.document.revision}`;
  const content = [markdown.split('\n')[0], markdown.slice(markdown.indexOf('\n') + 1).trim()];
  await publishNotebookCells(
    notebookId,
    () =>
      content.map((text, index) => ({
        id: `${identity}-${index}`,
        type: 'markdown',
        content: text,
        metadata: {
          nativeStudy: { workspace: view.document.id, revision: view.document.revision },
        },
      })),
    { signal }
  );
}
