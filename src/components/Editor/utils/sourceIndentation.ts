const indentationLength = (value: string, offset = 0) =>
  value[offset] === '\t' ? 1 : value[offset] === ' ' ? (value[offset + 1] === ' ' ? 2 : 1) : 0;

/** Return the selected-line replacement; selection ending at a line start excludes that line. */
export function indentSourceChange(value: string, start: number, end: number, outdent: boolean) {
  const first = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  if (start === end) {
    const removed = outdent ? indentationLength(value, first) : 0;
    const insert = outdent ? '' : '  ';
    const caret = start + insert.length - Math.min(removed, start - first);
    return { from: first, to: first + removed, insert, start: caret, end: caret };
  }
  const limit = end > start && value[end - 1] === '\n' ? end - 1 : end;
  // Text after the selection needs no replacement. Outdent may consume the
  // remainder of the final line's prefix when selection ends inside its spaces.
  let last = limit;
  if (outdent) {
    const finalLine = limit === 0 ? 0 : value.lastIndexOf('\n', limit - 1) + 1;
    last = Math.max(limit, finalLine + indentationLength(value, finalLine));
  }
  let mappedStart = start;
  let mappedEnd = end;
  let position = first;
  const replacement = value
    .slice(first, last)
    .split('\n')
    .map((line) => {
      const removed = outdent ? indentationLength(line) : 0;
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
