import type { Cell } from '@Store/models';

/** Stable source identity makes retry safe and leaves edited cells under user control. */
export async function nativeCodeCell(
  namespace: 'dataset' | 'comparison' | 'reference',
  source: string,
  metadata: Cell['metadata']
): Promise<Partial<Cell> & { id: string; content: string }> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const identity = Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return {
    id: `aal-${namespace}-${identity}`,
    type: 'code',
    language: 'aal',
    content: source,
    metadata,
  };
}
