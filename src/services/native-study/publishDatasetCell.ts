import type { DatasetMetadata } from './NativeDatasetClient';
import { datasetCellSource } from './datasetCellSource';
import { publishNotebookCells } from './publishNotebookCells';

/** Source pins are executable; metadata is descriptive and never grants data access. */
export async function publishDatasetCell(
  notebookId: string,
  dataset: DatasetMetadata,
  columns: readonly string[],
  clusters: number,
  signal?: AbortSignal
): Promise<void> {
  const source = datasetCellSource(dataset.version, columns, clusters);
  const pinned = { ...dataset, columns: [...columns], clusters };
  await publishNotebookCells(
    notebookId,
    async () => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      const identity = Array.from(new Uint8Array(bytes))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      return [
        {
          id: `aal-dataset-${identity}`,
          type: 'code',
          language: 'aal',
          content: source,
          metadata: { nativeDataset: pinned },
        },
      ];
    },
    { signal, requireUnedited: true }
  );
}
