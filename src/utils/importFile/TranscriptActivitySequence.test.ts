import { expect, it } from 'vitest';
import { ClaudeCodeTranscript } from './ClaudeCodeTranscript';
import { TranscriptActivitySequence } from './TranscriptActivitySequence';

it('groups adjacent calls and statuses without crossing prose or a request', () => {
  const { cells } = new ClaudeCodeTranscript().parse(
    '❯ Check\n⏺ Bash(ls)\n  ⎿  a\n⏺ Bash(pwd)\n  ⎿  b\n✻ Done\n⏺ Explanation\n⏺ Bash(date)\n  ⎿  c\n❯ Again\n⏺ Bash(ls)',
    'test.txt'
  );
  const before = JSON.stringify(cells);
  const groups = TranscriptActivitySequence.project(cells);
  const calls = cells.filter((cell) => cell.metadata?.transcriptKind === 'command');
  const first = groups.get(calls[0].id)!;
  expect(first).toBe(groups.get(calls[1].id));
  expect(first.calls).toBe(2);
  expect(first.outputs).toBe(2);
  expect(first.cells).toHaveLength(3);
  expect(groups.get(calls[2].id)).not.toBe(first);
  expect(groups.get(calls[3].id)).not.toBe(groups.get(calls[2].id));
  expect(JSON.stringify(cells)).toBe(before);
  expect(TranscriptActivitySequence.project(cells)).toBe(groups);
});

it('keeps source editing inside its sequence and recomputes boundaries after insertion/removal', () => {
  const { cells } = new ClaudeCodeTranscript().parse(
    '❯ Check\n⏺ Bash(ls)\n⏺ Bash(pwd)',
    'test.txt'
  );
  const edited = cells.map((cell, i) =>
    i === 3 ? { ...cell, metadata: { ...cell.metadata, editorMode: 'source' } } : cell
  );
  expect(TranscriptActivitySequence.project(edited).get(cells[2].id)?.cells).toHaveLength(2);
  const split = [
    ...edited.slice(0, 3),
    { id: 'note', type: 'markdown' as const, content: 'Note', outputs: [] },
    edited[3],
  ];
  expect(TranscriptActivitySequence.project(split).get(cells[2].id)?.cells).toHaveLength(1);
  expect(TranscriptActivitySequence.project(edited.slice(0, 3)).get(cells[3].id)).toBeUndefined();
});

it('attaches context by message ownership, never by adjacency alone', () => {
  const { cells } = new ClaudeCodeTranscript().parse(
    '❯ Check\n⏺ Bash(ls)\n  ⎿  result\n  ⎿  Shell cwd was reset to /work\n  ⎿  Read /work/a.py (10 lines)\n  ⎿  Referenced file /work/b.md\n✻ Finished\n⏺ Bash(pwd)\n  ⎿  /work',
    'test.txt'
  );
  const group = TranscriptActivitySequence.project(cells).get(cells[2].id)!;
  expect(group.steps).toHaveLength(2);
  expect(group.steps[0].context.map((cell) => cell.content)).toEqual([
    'Shell cwd was reset to /work',
    'Read /work/a.py (10 lines)',
    'Referenced file /work/b.md',
  ]);
  expect(group.steps[1].context).toHaveLength(0);
  expect(group.entries.map((entry) => entry.call?.content ?? 'context')).toEqual([
    'ls',
    'context',
    'pwd',
  ]);
  expect(
    group.entries
      .filter((entry) => !entry.call)
      .flatMap((entry) => entry.context.map((cell) => cell.content))
  ).toEqual(['Finished']);
  // Existing imports also retain the original message identity.
  const old = cells.map((cell) =>
    cell.metadata?.transcriptRole === 'system'
      ? { ...cell, metadata: { ...cell.metadata, toolCallId: undefined } }
      : cell
  );
  expect(TranscriptActivitySequence.project(old).get(cells[2].id)?.steps[0].context).toHaveLength(
    3
  );
});
