import { NativeDatasetClient, type DatasetMetadata } from './NativeDatasetClient';
import { comparisonCellSource } from './datasetCellSource';
import { nativeCodeCell } from './nativeCodeCell';
import { publishNotebookCells } from './publishNotebookCells';

export interface ComparisonCellInput {
  referenceCsv: string;
  queryCsv: string;
  columns: readonly string[];
  clusters: number;
  neighbors: number;
}

/** Freeze form inputs, archive both versions, then durably publish executable source. */
export async function publishComparisonCell(
  notebookId: string,
  input: ComparisonCellInput,
  signal?: AbortSignal
): Promise<void> {
  const frozen = { ...input, columns: [...input.columns] };
  // Validate all source settings before the first durable upload.
  comparisonCellSource(
    '0'.repeat(64),
    '0'.repeat(64),
    frozen.columns,
    frozen.clusters,
    frozen.neighbors
  );
  if (!frozen.referenceCsv.trim() || !frozen.queryCsv.trim())
    throw new Error('请提供参考与新样本 CSV');
  const client = new NativeDatasetClient(notebookId);
  await publishNotebookCells(
    notebookId,
    async (owned) => {
      const reference = await client.upload('housing-reference.csv', frozen.referenceCsv, owned);
      owned.throwIfAborted();
      const query = await client.upload('housing-query.csv', frozen.queryCsv, owned);
      owned.throwIfAborted();
      const source = comparisonCellSource(
        reference.version,
        query.version,
        frozen.columns,
        frozen.clusters,
        frozen.neighbors
      );
      // CSV contents live in the native archive, never duplicated in editor metadata.
      const metadata = ({ name, version, sha256, size }: DatasetMetadata): DatasetMetadata => ({
        name,
        version,
        sha256,
        size,
      });
      return [
        await nativeCodeCell('comparison', source, {
          nativeComparison: {
            reference: metadata(reference),
            query: metadata(query),
            columns: frozen.columns,
            clusters: frozen.clusters,
            neighbors: frozen.neighbors,
          },
        }),
      ];
    },
    { signal, requireUnedited: true }
  );
}
