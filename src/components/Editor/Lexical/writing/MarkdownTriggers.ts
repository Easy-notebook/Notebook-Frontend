export interface MarkdownTrigger {
  start: number;
  end: number;
  kind: 'block' | 'emphasis' | 'code' | 'link';
  state: 'pending' | 'complete';
}
/** Detect source delimiters without interpreting escaped characters or code contents as markup. */
export function markdownTriggers(source: string): MarkdownTrigger[] {
  const result: MarkdownTrigger[] = [];
  const prefixes = [...source.matchAll(/^(?:#{1,6}(?=\s|$)|>(?=\s|$)|(?:[-+*]|\d+[.)])(?=\s))/gm)];
  for (const prefix of prefixes)
    result.push({
      start: prefix.index!,
      end: prefix.index! + prefix[0].length,
      kind: 'block',
      state: 'pending',
    });
  const stack = new Map<string, number>();
  let code: string | null = null;
  for (let i = 0; i < source.length; ) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    const token = /^(?:`+|\*{1,3}|_{1,3}|~~|\]\(|\]\[|\[|\]|\))/.exec(source.slice(i))?.[0];
    if (!token) {
      i++;
      continue;
    }
    if (code && token !== code) {
      i += token.length;
      continue;
    }
    if (token[0] === '`') {
      const opening = stack.get(token);
      if (opening !== undefined) {
        result[opening].state = 'complete';
        result.push({ start: i, end: i + token.length, kind: 'code', state: 'complete' });
        stack.delete(token);
        code = null;
      } else {
        stack.set(token, result.length);
        result.push({ start: i, end: i + token.length, kind: 'code', state: 'pending' });
        code = token;
      }
    } else if (
      token === '[' ||
      token === '](' ||
      token === '][' ||
      token === ']' ||
      token === ')'
    ) {
      // Parentheses are link delimiters only after a label/destination opener.
      if (token !== '[' && !stack.has('link')) {
        i += token.length;
        continue;
      }
      if (token === '[') stack.set('link', result.length);
      result.push({ start: i, end: i + token.length, kind: 'link', state: 'pending' });
      if (token === ')' || (token === ']' && source.slice(0, i).includes(']['))) {
        for (let j = stack.get('link')!; j < result.length; j++)
          if (result[j].kind === 'link') result[j].state = 'complete';
        stack.delete('link');
      }
    } else if (
      !prefixes.some((prefix) => i >= prefix.index! && i < prefix.index! + prefix[0].length)
    ) {
      const opening = stack.get(token);
      if (opening !== undefined) {
        result[opening].state = 'complete';
        result.push({ start: i, end: i + token.length, kind: 'emphasis', state: 'complete' });
        stack.delete(token);
      } else {
        stack.set(token, result.length);
        result.push({ start: i, end: i + token.length, kind: 'emphasis', state: 'pending' });
      }
    }
    i += token.length;
  }
  return result;
}
