import type { DatasetMetadata } from './NativeDatasetClient';
import { datasetCellSource } from './datasetCellSource';
import { publishNotebookCells } from './publishNotebookCells';
import { nativeCodeCell } from './nativeCodeCell';

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
    async () => [await nativeCodeCell('dataset', source, { nativeDataset: pinned })],
    { signal, requireUnedited: true }
  );
}
