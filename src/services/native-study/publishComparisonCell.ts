import { NativeDatasetClient, type DatasetMetadata } from './NativeDatasetClient';
import {
  comparisonCellSource,
  evidenceCellSource,
  comparisonWorkflowSources,
  datasetCellSource,
} from './datasetCellSource';
import { nativeCodeCell } from './nativeCodeCell';
import { publishNotebookCells } from './publishNotebookCells';

export interface ComparisonCellInput {
  referenceCsv: string;
  queryCsv: string;
  columns: readonly string[];
  clusters: number;
  neighbors: number;
}

export interface EvidenceCellInput extends ComparisonCellInput {
  queryRow?: number;
}

/** Freeze form inputs, archive both versions, then durably publish executable source. */
export function publishComparisonCell(
  notebookId: string,
  input: ComparisonCellInput,
  signal?: AbortSignal
): Promise<void> {
  return publishComparison(notebookId, input, 'comparison', signal);
}
export function publishComparisonWorkflow(
  notebookId: string,
  input: ComparisonCellInput,
  signal?: AbortSignal
): Promise<void> {
  return publishComparison(notebookId, input, 'shared', signal);
}
export function publishEvidenceCell(
  notebookId: string,
  input: EvidenceCellInput,
  signal?: AbortSignal
): Promise<void> {
  return publishComparison(notebookId, input, 'evidence', signal, input.queryRow ?? 0);
}
async function publishComparison(
  notebookId: string,
  input: ComparisonCellInput,
  kind: 'comparison' | 'shared' | 'evidence',
  signal?: AbortSignal,
  queryRow = 0
): Promise<void> {
  const frozen = { ...input, columns: [...input.columns] };
  const generate = (reference: string, query: string) =>
    kind === 'evidence'
      ? evidenceCellSource(
          reference,
          query,
          frozen.columns,
          frozen.clusters,
          frozen.neighbors,
          queryRow
        )
      : comparisonCellSource(reference, query, frozen.columns, frozen.clusters, frozen.neighbors);
  // Validate all source settings before the first durable upload.
  generate('0'.repeat(64), '0'.repeat(64));
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
      const source = generate(reference.version, query.version);
      // CSV contents live in the native archive, never duplicated in editor metadata.
      const metadata = ({ name, version, sha256, size }: DatasetMetadata): DatasetMetadata => ({
        name,
        version,
        sha256,
        size,
      });
      if (kind === 'shared') {
        const key = (
          await nativeCodeCell(
            'reference',
            datasetCellSource(reference.version, frozen.columns, frozen.clusters),
            {}
          )
        ).id;
        const [fit, compare] = comparisonWorkflowSources(
          reference.version,
          query.version,
          frozen.columns,
          frozen.clusters,
          frozen.neighbors,
          key
        );
        return [
          await nativeCodeCell('reference', fit, { nativeSharedValue: key }),
          await nativeCodeCell('comparison', compare, { nativeSharedValue: key }),
        ];
      }
      return [
        await nativeCodeCell(kind, source, {
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
