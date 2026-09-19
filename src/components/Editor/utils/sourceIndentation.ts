export interface SourceSelectionEdit {
  value: string;
  start: number;
  end: number;
}

/** Touch selected lines only. A selection ending at the next line's start excludes that line. */
export function indentSourceLines(
  value: string,
  start: number,
  end: number,
  outdent: boolean
): SourceSelectionEdit {
  const edit = indentSourceChange(value, start, end, outdent);
  return {
    value: value.slice(0, edit.from) + edit.insert + value.slice(edit.to),
    start: edit.start,
    end: edit.end,
  };
}

/** Return the known replacement range for transaction-based source buffers. */
export function indentSourceChange(value: string, start: number, end: number, outdent: boolean) {
  const first = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  const limit = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const newline = value.indexOf('\n', limit);
  const last = newline < 0 ? value.length : newline;
  let mappedStart = start;
  let mappedEnd = end;
  let position = first;
  const replacement = value
    .slice(first, last)
    .split('\n')
    .map((line) => {
      const removed = outdent ? (/^(?:\t| {1,2})/.exec(line)?.[0].length ?? 0) : 0;
      const added = outdent ? 0 : 2;
      const map = (point: number) =>
        point >= position ? added - Math.min(removed, point - position) : 0;
      mappedStart += map(start);
      mappedEnd += map(end);
      position += line.length + 1;
      return outdent ? line.slice(removed) : '  ' + line;
    })
    .join('\n');
  return {
    from: first,
    to: last,
    insert: replacement,
    start: mappedStart,
    end: mappedEnd,
  };
}
