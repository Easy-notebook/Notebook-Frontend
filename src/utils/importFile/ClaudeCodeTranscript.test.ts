import { describe, expect, it } from 'vitest';
import { ClaudeCodeTranscript } from './ClaudeCodeTranscript';
const parse = (text: string) => new ClaudeCodeTranscript().parse(text, 'conversation.txt');

describe('semantic Claude Code import', () => {
  it('separates prose, Bash input, output and unrelated read/cwd events', () => {
    const { cells } = parse(
      "❯ 请检查\n⏺ I will inspect.\n⏺ Bash(python3 - <<'EOF'\n      print('ok')…)\n  ⎿  ok\n     … +62 lines (ctrl+o to expand)\n  ⎿  Shell cwd was reset to /tmp\n  ⎿  Read README.md (10 lines)\n⏺ Done."
    );
    const command = cells.find((cell) => cell.language === 'bash')!;
    expect(command.content).toBe("python3 - <<'EOF'\nprint('ok')…");
    expect(command.outputs).toEqual([
      expect.objectContaining({ type: 'text', content: 'ok\n… +62 lines (ctrl+o to expand)' }),
    ]);
    expect(command.metadata).toMatchObject({
      toolName: 'Bash',
      issues: ['truncated', 'wrapped'],
      executionPolicy: 'reference',
      toolCallId: expect.any(String),
    });
    expect(cells.filter((cell) => cell.metadata?.transcriptKind === 'status')).toHaveLength(2);
    expect(cells.find((cell) => cell.content === 'I will inspect.')?.type).toBe('markdown');
  });

  it('extracts unfenced Python and a multiline terminal table without swallowing explanation', () => {
    const { cells } = parse(
      '❯ Explain\n⏺ 核心接口\n\n  @dataclass\n  class Decision:\n      dimension: str\n\n  实验条件\n\n  ┌──────┬──────┐\n  │ 条件 │ 方法 │\n  ├──────┼──────┤\n  │ 文档 │ SQL  │\n  │ 上限 │ Agent│\n  └──────┴──────┘\n\n  最后说明。'
    );
    expect(cells.find((cell) => cell.language === 'python')?.content).toBe(
      '@dataclass\nclass Decision:\n    dimension: str'
    );
    expect(cells.find((cell) => cell.metadata?.transcriptKind === 'table')?.content).toBe(
      '| 条件 | 方法 |\n| --- | --- |\n| 文档上限 | SQL Agent |'
    );
    expect(cells[cells.length - 1]?.content).toBe('最后说明。');
    const response = cells.filter((cell) => cell.metadata?.transcriptRole === 'assistant');
    expect(new Set(response.map((cell) => cell.metadata?.messageId)).size).toBe(1);
  });

  it('extracts fenced code and keeps literal markers inside its boundary', () => {
    const { cells } = parse(
      '❯ Example\n⏺ Here:\n  ```text\n❯ literal\n⏺ literal\n  ```\n  More text\n❯ Thanks'
    );
    expect(cells.find((cell) => cell.type === 'code')?.content).toBe('❯ literal\n⏺ literal');
    expect(cells.filter((cell) => cell.metadata?.transcriptRole === 'user')).toHaveLength(2);
  });

  it('treats background completion as an event, and never completes truncated code', () => {
    const { cells } = parse(
      '❯ Wait\n⏺ Background command "python job.py" failed with exit code 1\n⏺ Bash(cat /tmp/fi…)\n  ⎿  Error\n⏺ Finished'
    );
    expect(cells[2].metadata).toMatchObject({
      transcriptKind: 'background',
      transcriptRole: 'system',
    });
    expect(cells.find((cell) => cell.language === 'bash')?.content).toBe('cat /tmp/fi…');
  });

  it('distinguishes numbered file previews from diffs and tool errors', () => {
    const { cells } = parse(
      '❯ Change\n⏺ Write(file.py)\n  ⎿  Wrote 10 lines\n      1 import os\n      2 print(os.getcwd())\n     … +8 lines (ctrl+o to expand)\n⏺ Update(file.py)\n  ⎿  Added 1 line, removed 1 line\n      2 -print(1)\n      2 +print(2)\n⏺ Update(other.py)\n  ⎿  File must be read first'
    );
    expect(cells.find((cell) => cell.metadata?.transcriptKind === 'file-preview')).toMatchObject({
      type: 'code',
      language: 'python',
      content: 'import os\nprint(os.getcwd())',
      metadata: { filePath: 'file.py', issues: expect.arrayContaining(['truncated']) },
    });
    expect(cells.find((cell) => cell.language === 'diff')?.content).toBe('-print(1)\n+print(2)');
    expect(cells[cells.length - 1]).toMatchObject({
      type: 'markdown',
      outputs: [expect.objectContaining({ content: 'File must be read first' })],
    });
  });

  it('retains broken tables literally and reflows Chinese prose without inventing missing rows', () => {
    const { cells } = parse(
      '❯ Explain\n⏺ 这段文字自动折\n  行。\n\n  ┌─────┬────┐\n  │ A │ B │\n  ├─────┼────┤\n  │ missing'
    );
    expect(cells.find((cell) => cell.metadata?.transcriptRole === 'assistant')?.content).toBe(
      '这段文字自动折行。'
    );
    expect(cells[cells.length - 1]?.metadata?.issues).toContain('table-unresolved');
  });

  it('accepts BOM/CRLF/style escapes and rejects ordinary text', () => {
    expect(parse('\uFEFF❯ Hello\r\n\x1b[32m⏺ Hi\x1b[0m').cells.slice(-1)[0]?.content).toBe('Hi');
    for (const text of ['', 'Some notes', '⏺ A bullet point'])
      expect(() => parse(text)).toThrow('not a recognized Claude Code');
  });
});

it('separates results concatenated onto a command line by the terminal export', () => {
  const { cells } = parse(
    '❯ Check\n⏺ Bash(python3 -…)  ⎿  Traceback (most recent call last):\n     ModuleNotFoundError\n  ⎿  Shell cwd was reset to /tmp'
  );
  const command = cells.find((cell) => cell.language === 'bash')!;
  expect(command.content).toBe('python3 -…');
  expect(command.outputs?.[0].content).toBe(
    'Traceback (most recent call last):\nModuleNotFoundError'
  );
  expect(command.metadata?.issues).toEqual(['truncated']);
});

it('preserves indentation in numbered Python file previews', () => {
  const { cells } = parse(
    '❯ Write\n⏺ Write(file.py)\n  ⎿  Wrote 2 lines\n      1 def f():\n      2     return 1'
  );
  expect(cells.find((cell) => cell.language === 'python')?.content).toBe('def f():\n    return 1');
});

it('retains key-value record boundaries and separators while reflowing explanations', () => {
  const { cells } = parse(
    '❯ Compare\n⏺ 图: 第一张\n  Codex: 1\n  Claude: 2\n  原因: 这是自动折\n  行。\n  ──────────\n  图: 第二张\n  Codex: 3'
  );
  expect(cells[2].content).toBe(
    '图: 第一张\nCodex: 1\nClaude: 2\n原因: 这是自动折行。\n\n---\n\n图: 第二张\nCodex: 3'
  );
});

it('keeps currency literal in request headings instead of interpreting it as math', () => {
  const { cells } = new ClaudeCodeTranscript().parse('❯ Compare $0.93 and $0.57\n⏺ Done', 'cost.txt');
  expect(cells[1].content).toBe('## Compare \\$0.93 and \\$0.57');
});
