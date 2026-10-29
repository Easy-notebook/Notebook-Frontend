import { v4 as uuidv4 } from 'uuid';
import type { Cell } from '@Store/models';
import {
  TranscriptEvents,
  messageLines,
  sourceText,
  type TranscriptEvent,
  type SourceLine,
} from './claude/TranscriptEvents';
import { TranscriptBody } from './claude/TranscriptBody';
import { TranscriptTool } from './claude/TranscriptTool';

/** One semantic import pipeline shared by the file picker and batch conversion CLI. */
export class ClaudeCodeTranscript {
  parse(
    source: string,
    fileName: string
  ): { title: string; cells: Cell[]; events: TranscriptEvent[] } {
    const events = new TranscriptEvents().read(source);
    const title =
      fileName
        .replace(/\.txt$/i, '')
        .replace(/[\r\n]+/g, ' ')
        .trim() || 'Claude Code conversation';
    const cells: Cell[] = [
      {
        id: `imported-${uuidv4()}`,
        type: 'markdown',
        content: `# ${title}`,
        outputs: [],
        phaseId: null,
      },
    ];
    for (const event of events) {
      const create = (
        content: string,
        lines: SourceLine[],
        kind: string,
        issues: string[] = []
      ): Cell => ({
        id: `imported-${uuidv4()}`,
        type: 'markdown',
        content,
        outputs: [],
        phaseId: null,
        enableEdit: true,
        metadata: {
          importSource: 'claude-code',
          transcriptFormat: 2,
          transcriptRole: event.role,
          transcriptKind: kind,
          sourceFile: fileName,
          messageId: event.id,
          turnId: `turn-${event.turn}`,
          turnIndex: event.turn,
          toolCallId: event.kind === 'tool-call' ? event.id : undefined,
          toolName: event.tool,
          sourceLine: lines[0]?.number,
          sourceEndLine: lines[lines.length - 1]?.number,
          originalSource: sourceText(
            event.lines.filter(
              (line) =>
                line.number >= (lines[0]?.number ?? 0) &&
                line.number <= (lines[lines.length - 1]?.number ?? Infinity)
            )
          ),
          issues: [...new Set(issues)],
          executionPolicy: 'reference',
        },
      });
      if (event.kind === 'tool-call') {
        const tool = new TranscriptTool().decode(event);
        const cell = create(tool.content, event.lines, tool.kind, tool.issues);
        cell.type = tool.type;
        cell.language = tool.language;
        cell.outputs = tool.outputs;
        cell.metadata = { ...cell.metadata, filePath: tool.path };
        cells.push(cell);
        for (const activity of tool.activities) {
          const status = create(sourceText(activity).replace(/^ {2}⎿\s*/, ''), activity, 'status');
          status.metadata = { ...status.metadata, transcriptRole: 'system', toolCallId: event.id };
          cells.push(status);
        }
      } else if (event.kind === 'message') {
        const parts = new TranscriptBody().split(messageLines(event));
        parts.forEach((part, index) => {
          const cell = create(part.content, part.lines, part.kind, part.issues);
          if (event.role === 'user' && index === 0 && part.kind === 'prose') {
            const [first, ...rest] = part.content.split('\n');
            cell.content =
              '## ' +
              first.replace(/^#{1,6}\s+/, '').replace(/\$/g, '\\$') +
              (rest.length ? '\n' + rest.join('\n') : '');
          }
          if (part.kind === 'code') {
            cell.type = 'code';
            cell.language = part.language;
          }
          cell.metadata = { ...cell.metadata, messageStart: index === 0 };
          cells.push(cell);
        });
      } else
        cells.push(
          create(sourceText(event.lines).replace(/^[⏺✻✽✶✳✢·※]\s*/, ''), event.lines, event.kind)
        );
    }
    return { title, cells, events };
  }
}
