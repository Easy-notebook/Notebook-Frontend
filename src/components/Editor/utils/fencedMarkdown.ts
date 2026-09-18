export interface FencedBlock {
  kind: 'fence';
  start: number;
  end: number;
  source: string;
  code: string;
  info: string;
  language: string;
  marker: '`' | '~';
  length: number;
  indent: string;
  newline: string;
}
export interface MarkdownText {
  kind: 'text';
  source: string;
}
export type MarkdownSegment = FencedBlock | MarkdownText;

/** One forward pass. An open fence owns every following line until its matching close. */
export function scanFencedMarkdown(source: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let pending:
    | (Omit<FencedBlock, 'kind' | 'end' | 'source' | 'code' | 'language'> & { bodyStart: number })
    | undefined;
  let textStart = 0;
  for (const match of source.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!match[0]) break;
    const start = match.index!;
    const line = match[0].replace(/[\r\n]+$/, '');
    const ending = match[0].slice(line.length);
    if (!pending) {
      const opening = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
      if (!opening || (opening[2][0] === '`' && opening[3].includes('`'))) continue;
      pending = {
        start,
        bodyStart: start + match[0].length,
        marker: opening[2][0] as '`' | '~',
        length: opening[2].length,
        info: opening[3],
        indent: opening[1],
        newline: ending || '\n',
      };
    } else {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (!closing || closing[1][0] !== pending.marker || closing[1].length < pending.length)
        continue;
      if (pending.start > textStart)
        segments.push({ kind: 'text', source: source.slice(textStart, pending.start) });
      const end = start + line.length;
      let code = source.slice(pending.bodyStart, start);
      if (code.endsWith(pending.newline)) code = code.slice(0, -pending.newline.length);
      segments.push({
        ...pending,
        kind: 'fence',
        end,
        code,
        source: source.slice(pending.start, end),
        language: pending.info.trim().split(/\s+/)[0].toLowerCase(),
      });
      pending = undefined;
      textStart = end;
    }
  }
  // Incomplete fences stay literal so half-typed syntax is never silently completed.
  if (textStart < source.length) segments.push({ kind: 'text', source: source.slice(textStart) });
  return segments;
}

export function standaloneFence(source: string): FencedBlock | undefined {
  const segments = scanFencedMarkdown(source);
  const fences = segments.filter((part): part is FencedBlock => part.kind === 'fence');
  return fences.length === 1 &&
    segments.every((part) => part.kind === 'fence' || !part.source.trim())
    ? fences[0]
    : undefined;
}

/** Grow delimiters when code contains a fence-like line; never truncate the payload. */
export function formatCodeFence(
  code: string,
  language: string,
  marker: '`' | '~' = '`',
  minimum = 3
): string {
  let length = Math.max(3, minimum);
  for (const line of code.split(/\r\n|\n|\r/)) {
    const fence = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
    if (fence?.[1][0] === marker) length = Math.max(length, fence[1].length + 1);
  }
  const delimiter = marker.repeat(length);
  return `${delimiter}${language}\n${code}\n${delimiter}`;
}
