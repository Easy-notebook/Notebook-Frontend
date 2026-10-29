import { z } from 'zod';
const id = z.string().min(1).max(200);
const content = z.string().max(500_000);
export const documentToolSchemas = {
  read_notebook: z
    .object({
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(30).default(15),
    })
    .strict(),
  backup_notebook: z.object({ version: id, label: z.string().min(1).max(100) }).strict(),
  apply_notebook_edits: z
    .object({
      version: id,
      backupId: z.string().uuid(),
      operations: z
        .array(
          z.discriminatedUnion('op', [
            z.object({ op: z.literal('update'), cellId: id, content }).strict(),
            z.object({ op: z.literal('insert'), afterCellId: id.nullable(), content }).strict(),
            z.object({ op: z.literal('move'), cellId: id, afterCellId: id.nullable() }).strict(),
            z.object({ op: z.literal('remove'), cellId: id }).strict(),
          ])
        )
        .min(1)
        .max(200),
    })
    .strict(),
  save_notebook_copy: z.object({ version: id, label: z.string().min(1).max(100) }).strict(),
  flush_notebook: z.object({ version: id }).strict(),
  list_notebook_files: z.object({}).strict(),
  read_notebook_file: z
    .object({ fileId: z.string().uuid(), offset: z.number().int().nonnegative().default(0) })
    .strict(),
};
export const documentToolDescriptions: Record<keyof typeof documentToolSchemas, string> = {
  read_notebook:
    'Read a bounded page of current notebook cells, original import provenance, and the document version. Follow nextOffset until null. Use read_cell for full content of large cells. Agent conversation bodies are omitted. Re-read after conflicts.',
  backup_notebook:
    'Create a NEW immutable .easynb disk backup of the current live notebook version, including outputs and metadata. Returns backupId, exact filesystem path and SHA256. Must succeed before apply_notebook_edits; never overwrites the imported original.',
  apply_notebook_edits:
    'Atomically apply ordered content updates, Markdown insertions, moves or removals to the current notebook. Requires current document version and a backup of that version from this run. Never edit protected agent/read-only cells. Existing metadata and outputs remain intact. One batch is one approval. Returns new version and inserted IDs; call flush_notebook next.',
  save_notebook_copy:
    'Save the current version as a NEW .easynb disk file. Returns fileId, exact filesystem path and SHA256. Use after edits and flush_notebook to deliver the organized result. Does not overwrite existing files.',
  flush_notebook:
    'Persist the current version to canonical notebook storage and await completion. Returns saved evidence; on failure edits may still be in the editor, so retry flush without repeating edits.',
  list_notebook_files:
    'List managed .easynb backups/result copies for this notebook only, with file IDs, paths and sizes. Does not enumerate arbitrary filesystem directories.',
  read_notebook_file:
    'Read a bounded text chunk of a managed .easynb file by fileId. Follow nextOffset until null; no arbitrary filesystem paths.',
};
export type DocumentToolName = keyof typeof documentToolSchemas;
export type NotebookEditBatch = z.infer<typeof documentToolSchemas.apply_notebook_edits>;
