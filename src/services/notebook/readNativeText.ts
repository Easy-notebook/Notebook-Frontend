import { z } from 'zod';
const pageSchema = z.object({
  revision: z.number().int(),
  size: z
    .number()
    .int()
    .min(0)
    .max(2 * 1024 * 1024),
  content: z.string(),
  nextOffset: z.number().int().nullable(),
});
/** Version-consistent, bounded UTF-8 pages shared by working files and history records. */
export async function readNativeText(read: (offset: number) => Promise<unknown>): Promise<string> {
  const parts: string[] = [];
  let offset = 0;
  let revision: number | undefined;
  let bytes = 0;
  for (;;) {
    const page = pageSchema.parse(await read(offset));
    if (revision !== undefined && revision !== page.revision)
      throw new Error('File changed while reading; retry');
    revision = page.revision;
    bytes += new TextEncoder().encode(page.content).length;
    if (bytes > 2 * 1024 * 1024) throw new Error('File exceeds read limit');
    parts.push(page.content);
    if (page.nextOffset === null) return parts.join('');
    if (page.nextOffset <= offset) throw new Error('Invalid file page');
    offset = page.nextOffset;
  }
}
