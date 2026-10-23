import { z } from 'zod';
import { NativeNotebookTransport } from '@Services/notebook/NativeNotebookTransport';
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const scan = z
  .object({ content_hash: hash, verdict: z.enum(['clear', 'caution', 'dangerous']) })
  .passthrough();
export interface ArchiveInput {
  workspace: string;
  expected_revision: number;
  name: string;
  bytes: number[];
}
export class SkillArchiveClient {
  constructor(private readonly notebookId: string) {}
  private async request(
    input: ArchiveInput,
    signal: AbortSignal,
    review?: { content_hash: string; decision: 'accepted'; reviewer: string; note: string }
  ) {
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(input.bytes))),
      (b) => b.toString(16).padStart(2, '0')
    ).join('');
    const shape = z.object({
      frontend_notebook_id: z.literal(this.notebookId),
      workspace: z.literal(input.workspace),
      revision: z.literal(input.expected_revision),
      name: z.literal(input.name),
      archive_sha256: z.literal(digest),
      archive_bytes: z.literal(input.bytes.length),
      content_hash: hash,
      scan,
      execution_authorized: z.literal(false),
    });
    const response = await new NativeNotebookTransport(this.notebookId).send(
      review ? 'skill-archive/accept' : 'skill-archive/inspect',
      review ? { archive: input, review } : input,
      signal
    );
    const result = (
      review ? shape.extend({ lock: z.unknown() }) : shape.extend({ candidate: z.unknown() })
    )
      .strict()
      .parse(response);
    if (
      result.scan.content_hash !== result.content_hash ||
      (review && review.content_hash !== result.content_hash)
    )
      throw new Error('档案内容与审核标识不一致。');
    return result;
  }
  inspect(input: ArchiveInput, signal: AbortSignal) {
    return this.request(input, signal);
  }
  accept(
    input: ArchiveInput,
    contentHash: string,
    reviewer: string,
    note: string,
    signal: AbortSignal
  ) {
    return this.request(input, signal, {
      content_hash: contentHash,
      decision: 'accepted',
      reviewer,
      note,
    });
  }
}
