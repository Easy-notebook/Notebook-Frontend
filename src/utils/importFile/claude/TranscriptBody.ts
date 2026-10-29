import type { SourceLine } from './TranscriptEvents';

export interface BodyPart {
  kind: 'prose' | 'code' | 'table' | 'literal';
  content: string;
  language?: string;
  lines: SourceLine[];
  issues: string[];
}

/** Recover only structures supported by explicit fences, table borders or code syntax. */
export class TranscriptBody {
  split(lines: SourceLine[]): BodyPart[] {
    const parts: BodyPart[] = [];
    let index = 0;
    while (index < lines.length) {
      if (!lines[index].text.trim()) {
        index++;
        continue;
      }
      const start = index;
      const fence = /^\s*(`{3,}|~{3,})([\w+-]*)\s*$/.exec(lines[index].text);
      if (fence) {
        index++;
        while (
          index < lines.length &&
          !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[index].text)
        )
          index++;
        const closed = index < lines.length;
        const code = lines
          .slice(start + 1, index)
          .map((line) => line.text)
          .join('\n');
        if (closed) index++;
        parts.push({
          kind: 'code',
          content: code,
          language: fence[2] || 'text',
          lines: lines.slice(start, index),
          issues: closed ? [] : ['truncated'],
        });
        continue;
      }
      if (/^\s*┌[─┬]+┐\s*$/.test(lines[index].text)) {
        index++;
        while (
          index < lines.length &&
          /^[\s│├┼┤─└┴┘┌┬┐]/.test(lines[index].text) &&
          lines[index].text.trim()
        ) {
          if (/^\s*└[─┴]+┘\s*$/.test(lines[index++].text)) break;
        }
        const block = lines.slice(start, index);
        const table = this.table(block);
        parts.push({
          kind: table ? 'table' : 'literal',
          content: table ?? block.map((line) => line.text).join('\n'),
          language: table ? undefined : 'text',
          lines: block,
          issues: table ? [] : ['table-unresolved'],
        });
        continue;
      }
      const language = this.language(lines[index].text);
      if (language) {
        index++;
        while (index < lines.length && lines[index].text.trim()) {
          const line = lines[index].text;
          if (/^[\p{Script=Han}]/u.test(line) || /^\s*┌/.test(line)) break;
          index++;
        }
        const block = lines.slice(start, index);
        parts.push({
          kind: 'code',
          content: block.map((line) => line.text).join('\n'),
          language,
          lines: block,
          issues: [
            'snippet',
            ...(block.some((line) => /->\s*$/.test(line.text)) ? ['wrapped'] : []),
          ],
        });
        continue;
      }
      index++;
      while (
        index < lines.length &&
        lines[index].text.trim() &&
        !this.language(lines[index].text) &&
        !/^\s*(?:┌[─┬]|`{3,}|~{3,})/.test(lines[index].text)
      )
        index++;
      const block = lines.slice(start, index);
      const raw = block.map((line) => line.text).join('\n');
      const literal = /[├└]─|[─━]─*[►▶]|^\s*[\w./-]+\/\s{2,}/m.test(raw);
      parts.push({
        kind: literal ? 'literal' : 'prose',
        content: literal ? raw : this.prose(block),
        language: literal ? 'text' : undefined,
        lines: block,
        issues: [],
      });
    }
    // Adjacent prose paragraphs remain one editable response, not a cell per paragraph.
    return parts.reduce<BodyPart[]>((result, part) => {
      const previous = result[result.length - 1];
      if (previous?.kind === 'prose' && part.kind === 'prose') {
        previous.content += '\n\n' + part.content;
        previous.lines = [...previous.lines, ...part.lines];
      } else result.push(part);
      return result;
    }, []);
  }

  private language(line: string): string | undefined {
    if (
      /^(?:@(?:dataclass|\w+\()|class \w+(?:\([^)]*\))?:|(?:async )?def \w+\(|from [\w.]+ import |import [\w.]+(?:\s*,|$))/.test(
        line
      )
    )
      return 'python';
    if (/^(?:SELECT\s+(?:\*|DISTINCT\b|[\w"`])|WITH \w+ AS\s*\(|CREATE TABLE\s)/.test(line))
      return 'sql';
    return undefined;
  }

  private prose(lines: SourceLine[]): string {
    const result: string[] = [];
    for (const { text } of lines) {
      if (/^\s*[─━]{3,}\s*$/.test(text)) {
        result.push('', '---', '');
        continue;
      }
      // Preserve field labels and record separators as well as lists; only prose wraps reflow.
      const field = /^[\p{Script=Han}\w ()（）/.-]{1,48}[:：](?!\/\/)/u.test(text.trim());
      if (
        !result.length ||
        !result[result.length - 1].trim() ||
        field ||
        /^\s*(?:[-*+] |\d+[.)] |#{1,6} |>)/.test(text)
      )
        result.push(text.trimEnd());
      else result[result.length - 1] = this.join(result[result.length - 1], text.trim());
    }
    return result.join('\n');
  }

  private join(left: string, right: string): string {
    if (!left) return right;
    if (!right) return left;
    const noSpace =
      /[\p{Script=Han}，。；：、（]$/u.test(left) && /^[\p{Script=Han}，。；：、）]/u.test(right);
    return left + (noSpace ? '' : ' ') + right;
  }

  private table(lines: SourceLine[]): string | undefined {
    if (!/^\s*└[─┴]+┘\s*$/.test(lines[lines.length - 1]?.text ?? '')) return undefined;
    const rows: string[][] = [];
    let row: string[] = [];
    let width = 0;
    for (const { text } of lines) {
      const line = text.trim();
      if (line.startsWith('│') && line.endsWith('│')) {
        const columns = line
          .slice(1, -1)
          .split('│')
          .map((value) => value.trim());
        width ||= columns.length;
        if (columns.length !== width) return undefined;
        row = columns.map((value, index) => this.join(row[index] ?? '', value));
      } else if (/^[├└]/.test(line)) {
        if (row.length) rows.push(row);
        row = [];
      } else if (!line.startsWith('┌')) return undefined;
    }
    if (rows.length < 2 || width < 2) return undefined;
    const render = (values: string[]) =>
      `| ${values.map((value) => value.replace(/\|/g, '\\|')).join(' | ')} |`;
    return [render(rows[0]), render(Array(width).fill('---')), ...rows.slice(1).map(render)].join(
      '\n'
    );
  }
}
