export type TranscriptRole = 'user' | 'assistant' | 'tool' | 'system';
export interface SourceLine {
  text: string;
  number: number;
}
export interface TranscriptEvent {
  id: string;
  turn: number;
  role: TranscriptRole;
  kind: 'message' | 'tool-call' | 'background' | 'status';
  tool?: string;
  lines: SourceLine[];
}

/** Terminal event boundaries are decoded before any Markdown or code interpretation. */
export class TranscriptEvents {
  read(source: string): TranscriptEvent[] {
    const text = source
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex -- Terminal display escapes are not content.
      .replace(/\x1b\[[0-9;]*m/g, '')
      // eslint-disable-next-line no-control-regex -- OSC hyperlink wrappers.
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
    if (!/^⏺\s+\S/m.test(text) || !(/Claude Code\s+v\d/.test(text) || /^❯\s+\S/m.test(text)))
      throw new Error('This file is not a recognized Claude Code text export.');
    const lines = text.split('\n');
    const events: TranscriptEvent[] = [];
    let turn = 0;
    let current: TranscriptEvent = {
      id: 'message-0',
      turn,
      role: 'system',
      kind: 'status',
      lines: [],
    };
    let fence: string | undefined;
    const flush = () => {
      if (current.lines.some((line) => line.text.trim())) events.push(current);
    };
    lines.forEach((line, index) => {
      const marker = !fence ? /^(❯|⏺|[✻✽✶✳✢·]|※)\s+(.*)$/.exec(line) : null;
      const activity =
        !fence &&
        /^ {2}(?:Read \d+ files?|Listed \d+ director|Searched for |Searching for )/.test(line);
      if (marker || activity) {
        flush();
        if (marker?.[1] === '❯') turn++;
        const tool =
          marker?.[1] === '⏺' ? /^([A-Za-z][\w:.-]*)\(/.exec(marker[2])?.[1] : undefined;
        const background = marker?.[1] === '⏺' && /^Background command /.test(marker[2]);
        const role: TranscriptRole =
          marker?.[1] === '❯'
            ? 'user'
            : tool
              ? 'tool'
              : marker?.[1] === '⏺' && !background
                ? 'assistant'
                : 'system';
        current = {
          id: `message-${index + 1}`,
          turn,
          role,
          kind: tool
            ? 'tool-call'
            : background
              ? 'background'
              : role === 'system'
                ? 'status'
                : 'message',
          tool,
          lines: [],
        };
      }
      current.lines.push({ text: line, number: index + 1 });
      if (current.kind === 'message') {
        const content = marker ? marker[2] : line.replace(/^ {2}/, '');
        const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(content);
        if (match && !fence) {
          // An incomplete exported fence must not swallow later real conversation turns.
          if (
            lines
              .slice(index + 1)
              .some((next) =>
                new RegExp(`^\\s*${match[1][0]}{${match[1].length},}\\s*$`).test(next)
              )
          )
            fence = match[1];
        } else if (
          match &&
          fence &&
          match[1][0] === fence[0] &&
          match[1].length >= fence.length &&
          !match[2].trim()
        )
          fence = undefined;
      }
    });
    flush();
    return events;
  }
}

export function messageLines(event: TranscriptEvent): SourceLine[] {
  return event.lines.map((line, index) => ({
    ...line,
    text: index === 0 ? line.text.replace(/^[❯⏺]\s?/, '') : line.text.replace(/^ {2}/, ''),
  }));
}
export function sourceText(lines: SourceLine[]): string {
  return lines
    .map((line) => line.text)
    .join('\n')
    .trimEnd();
}
