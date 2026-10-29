const blockIdentityPattern = /^[a-zA-Z0-9_-]{1,128}$/;
export type BlockKind = 'group' | 'callout' | 'toggle' | 'toggle-heading';
export type BlockMetadata = Readonly<{
  version: 1;
  id: string;
  kind: BlockKind;
  title: string;
  collapsed: boolean;
  foreground: string | null;
  background: string | null;
}>;
export function parseBlockMetadata(input: unknown): BlockMetadata {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw Error('Invalid block metadata');
  const data = input as Record<string, unknown>;
  const fields = ['version', 'id', 'kind', 'title', 'collapsed', 'foreground', 'background'];
  if (
    Object.keys(data).length !== fields.length ||
    Object.keys(data).some((key) => !fields.includes(key))
  )
    throw Error('Unsupported block metadata fields');
  if (data.version !== 1) throw Error('Unsupported block metadata version');
  if (typeof data.id !== 'string' || !blockIdentityPattern.test(data.id))
    throw Error('Invalid block identity');
  if (!['group', 'callout', 'toggle', 'toggle-heading'].includes(String(data.kind)))
    throw Error('Unknown block kind');
  if (
    typeof data.title !== 'string' ||
    data.title.length > 512 ||
    typeof data.collapsed !== 'boolean'
  )
    throw Error('Invalid block presentation');
  for (const field of ['foreground', 'background'])
    if (
      data[field] !== null &&
      (typeof data[field] !== 'string' || !/^#[a-f0-9]{6}$/i.test(data[field] as string))
    )
      throw Error('Invalid block color');
  return Object.freeze({ ...data }) as BlockMetadata;
}
export function newBlockMetadata(kind: BlockKind = 'group'): BlockMetadata {
  return parseBlockMetadata({
    version: 1,
    id: crypto.randomUUID(),
    kind,
    title: kind === 'callout' ? 'Note' : kind === 'toggle' ? 'Details' : '',
    collapsed: false,
    foreground: null,
    background: null,
  });
}
export function blockOpener(metadata: BlockMetadata): string {
  return (
    '<!-- notebook:block ' +
    JSON.stringify(parseBlockMetadata(metadata)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') +
    ' -->'
  );
}
export function blockCloser(id: string): string {
  return '<!-- /notebook:block ' + id + ' -->';
}
