import type { SourceLine, TranscriptEvent } from './TranscriptEvents';
import type { OutputItem } from '@Store/models';

export interface ToolDocument {
  content: string;
  type: 'code' | 'markdown';
  language?: string;
  kind: 'command' | 'file-preview' | 'diff' | 'tool';
  path?: string;
  issues: string[];
  outputs: OutputItem[];
  activities: SourceLine[][];
}

export class TranscriptTool {
  decode(event: TranscriptEvent): ToolDocument {
    // Some exports print the first result on the same physical line as the closing call.
    const lines = event.lines.flatMap((line) => {
      const boundary = /\) {2}⎿/.exec(line.text);
      if (!boundary) return [line];
      return [
        { ...line, text: line.text.slice(0, boundary.index + 1) },
        { ...line, text: line.text.slice(boundary.index + 1) },
      ];
    });
    const outputStart = lines.findIndex((line) => /^ {2}⎿/.test(line.text));
    const input = lines.slice(0, outputStart < 0 ? undefined : outputStart);
    const tool = event.tool!;
    const first = input[0].text.replace(/^⏺\s*/, '').slice(tool.length + 1);
    const gutter = tool.length + 2; // Terminal continuation indentation for this tool name.
    let argument = [
      first,
      ...input.slice(1).map((line) => line.text.replace(new RegExp(`^ {0,${gutter}}`), '')),
    ]
      .join('\n')
      .trimEnd();
    const closed = argument.endsWith(')');
    if (closed) argument = argument.slice(0, -1);
    const issues: string[] = [];
    if (/…|\.\.\./.test(argument) || !closed) issues.push('truncated');
    if (argument.includes('\n')) issues.push('wrapped');
    const groups: SourceLine[][] = [];
    for (const line of outputStart < 0 ? [] : lines.slice(outputStart)) {
      if (/^ {2}⎿/.test(line.text) || !groups.length) groups.push([]);
      groups[groups.length - 1]!.push(line);
    }
    const activities: SourceLine[][] = [];
    const resultGroups: SourceLine[][] = [];
    for (const group of groups) {
      if (
        /^ {2}⎿\s*(?:Shell cwd was reset|Read |Referenced file |Skills restored)/.test(group[0].text)
      )
        activities.push(group);
      else resultGroups.push(group);
    }
    const outputs = resultGroups.map((group, index) => ({
      type: 'text',
      key: `${event.id}:output-${index}`,
      content: group
        .map((line, i) =>
          i === 0 ? line.text.replace(/^ {2}⎿[ \u00a0]*/, '') : line.text.replace(/^ {5}/, '')
        )
        .join('\n')
        .trimEnd(),
    }));
    const base = { issues, outputs, activities };
    if (tool === 'Bash')
      return { ...base, type: 'code', kind: 'command', language: 'bash', content: argument };
    const path = argument.replace(/\n\s*/g, '');
    if (tool === 'Write' || tool === 'Update') {
      const preview: string[] = [];
      for (const output of outputs) {
        let reading = false;
        for (const line of output.content.split('\n')) {
          if (/… \+\d+ lines/.test(line)) {
            issues.push('truncated');
            reading = false;
            continue;
          }
          const numbered = /^\s*(\d+) ([ +-]?)(.*)$/.exec(line);
          if (numbered) {
            preview.push(tool === 'Update' ? numbered[2] + numbered[3] : numbered[2] + numbered[3]);
            reading = true;
          } else if (reading && line.trim()) {
            // Continuation is a terminal-wrapped source line, not proven code indentation.
            preview.push(line.replace(/^ {3}/, ''));
            issues.push('wrapped');
          }
        }
      }
      const extension = path.split('.').pop()?.toLowerCase();
      const languages: Record<string, string> = {
        py: 'python',
        sh: 'bash',
        js: 'javascript',
        ts: 'typescript',
        tsx: 'tsx',
        json: 'json',
        md: 'markdown',
        sql: 'sql',
        css: 'css',
        html: 'html',
        rs: 'rust',
        yaml: 'yaml',
        yml: 'yaml',
      };
      if (preview.length)
        return {
          ...base,
          path,
          type: 'code',
          kind: tool === 'Update' ? 'diff' : 'file-preview',
          language: tool === 'Update' ? 'diff' : (languages[extension ?? ''] ?? 'text'),
          content: preview.join('\n'),
          issues: [...new Set([...issues, 'snippet'])],
        };
    }
    return {
      ...base,
      path: tool === 'Skill' ? undefined : path,
      type: 'markdown',
      kind: 'tool',
      content: `${tool}: ${argument}`,
    };
  }
}
