/** One contiguous UTF-16 replacement, matching textarea and CodeMirror offsets. */
export function textReplacement(previous: string, next: string) {
  let from = 0;
  const limit = Math.min(previous.length, next.length);
  while (from < limit && previous.charCodeAt(from) === next.charCodeAt(from)) from++;
  let to = previous.length;
  let end = next.length;
  while (to > from && end > from && previous.charCodeAt(to - 1) === next.charCodeAt(end - 1)) {
    to--;
    end--;
  }
  return { from, to, insert: next.slice(from, end) };
}
