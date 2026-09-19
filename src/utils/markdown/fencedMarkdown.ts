/** Shared Markdown fence syntax for models, editors and export. */
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
export function* iterateFencedMarkdown(source: string): Generator<MarkdownSegment> {
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
        yield { kind: 'text', source: source.slice(textStart, pending.start) };
      const end = start + line.length;
      let codeEnd = start;
      // Closing separators need not match the opener after cross-platform paste.
      if (codeEnd > pending.bodyStart && source[codeEnd - 1] === '\n') {
        codeEnd--;
        if (codeEnd > pending.bodyStart && source[codeEnd - 1] === '\r') codeEnd--;
      } else if (codeEnd > pending.bodyStart && source[codeEnd - 1] === '\r') codeEnd--;
      const code = source.slice(pending.bodyStart, codeEnd);
      yield {
        ...pending,
        kind: 'fence',
        end,
        code,
        source: source.slice(pending.start, end),
        language: pending.info.trim().split(/\s+/)[0].toLowerCase(),
      };
      pending = undefined;
      textStart = end;
    }
  }
  // Incomplete fences stay literal so half-typed syntax is never silently completed.
  if (textStart < source.length) yield { kind: 'text', source: source.slice(textStart) };
}

export function scanFencedMarkdown(source: string): MarkdownSegment[] {
  return Array.from(iterateFencedMarkdown(source));
}

export function standaloneFence(source: string): FencedBlock | undefined {
  let fence: FencedBlock | undefined;
  for (const part of iterateFencedMarkdown(source)) {
    if (part.kind === 'fence') {
      if (fence) return undefined;
      fence = part;
    } else if (part.source.trim()) return undefined;
  }
  return fence;
}

/** Grow delimiters when code contains a fence-like line; never truncate the payload. */
export function formatCodeFence(
  code: string,
  language: string,
  marker: '`' | '~' = '`',
  minimum = 3
): string {
  const delimiter = marker.repeat(codeFenceLength(code, marker, minimum));
  // Do not merge a payload's terminal CR with an added LF into one separator.
  const closingNewline = code.endsWith('\r') ? '\r' : '\n';
  return `${delimiter}${language}\n${code}${closingNewline}${delimiter}`;
}

/** The editable code region of a mixed cell excludes diagram fences. */
export function firstExecutableFence(source: string): FencedBlock | undefined {
  for (const segment of iterateFencedMarkdown(source)) {
    if (segment.kind === 'fence' && segment.language !== 'mermaid') return segment;
  }
  return undefined;
}

function codeFenceLength(code: string, marker: '`' | '~', minimum: number): number {
  let length = Math.max(3, minimum);
  // Consume only candidate fence lines; do not allocate one string per code line.
  for (const fence of code.matchAll(/(?:^|[\r\n]) {0,3}(`+|~+)[ \t]*(?=[\r\n]|$)/g)) {
    if (fence[1][0] === marker) length = Math.max(length, fence[1].length + 1);
  }
  return length;
}

/** Replace the payload without normalizing source-owned fence formatting. */
export function replaceFencedCode(fence: FencedBlock, code: string): string {
  if (code === fence.code) return fence.source;
  const bodyStart = fence.source.indexOf(fence.newline) + fence.newline.length;
  const codeEnd = bodyStart + fence.code.length;
  const tail = fence.source.slice(codeEnd);
  const closing = /^(\r\n|\r|\n)?( {0,3})(`+|~+)([ \t]*)$/.exec(tail)!;
  const length = codeFenceLength(code, fence.marker, fence.length);
  const opening = fence.indent + fence.marker.repeat(length) + fence.info + fence.newline;
  let separator = closing[1] ?? fence.newline;
  // A terminal payload CR must not become half of the closing CRLF separator.
  if (code.endsWith('\r') && separator === '\n') separator = '\r';
  return opening + code + separator + closing[2] +
    fence.marker.repeat(Math.max(length, closing[3].length)) + closing[4];
}
