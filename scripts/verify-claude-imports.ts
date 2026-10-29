import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import type { Cell } from '../src/Store/models';

const directory = resolve(process.argv[2] ?? '');
const files = (await readdir(directory)).filter((name) => name.endsWith('.easynb')).sort();
assert.equal(files.length, 6, 'This audit expects the six requested transcripts');
const report = [
  '# Claude Code 语义导入检查',
  '',
  '检查正文、代码、关联输出、表格、源行号和截断标记。命令和文件预览保留已导出的片段；不会猜补折叠内容或修复不确定的代码折行。',
  '',
];
const totals: Record<string, number> = {};
for (const file of files) {
  const notebook = JSON.parse(await readFile(join(directory, file), 'utf8'));
  const cells: Cell[] = notebook.cells;
  const source: string = notebook.metadata.import.sourceText;
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  assert.equal(createHash('sha256').update(source).digest('hex'), notebook.metadata.import.sha256);
  const typed = cells.filter((cell) => cell.metadata?.transcriptFormat === 2);
  const commands = typed.filter((cell) => cell.metadata?.transcriptKind === 'command');
  assert.equal(commands.length, [...source.matchAll(/^⏺ Bash\(/gm)].length, `${file}: Bash calls`);
  assert.equal(
    typed.filter((cell) => cell.metadata?.messageStart && cell.metadata?.transcriptRole === 'user')
      .length,
    [...source.matchAll(/^❯ /gm)].length,
    `${file}: prompts`
  );
  assert.equal(
    typed.filter((cell) => cell.metadata?.transcriptKind === 'background').length,
    [...source.matchAll(/^⏺ Background command /gm)].length,
    `${file}: background events`
  );
  for (const cell of typed) {
    const meta = cell.metadata!;
    assert.equal(
      meta.originalSource,
      lines
        .slice(meta.sourceLine - 1, meta.sourceEndLine)
        .join('\n')
        .trimEnd(),
      `${file}: source excerpt at ${meta.sourceLine}`
    );
    assert.ok(meta.messageId && meta.turnId, `${file}: missing ownership`);
    if (cell.type === 'code') assert.equal(meta.executionPolicy, 'reference');
    if (cell.outputs?.length) {
      assert.ok(meta.toolCallId, `${file}: output without a call`);
      for (const output of cell.outputs)
        assert.ok(String(output.key).startsWith(meta.toolCallId + ':output-'));
    }
    if (meta.transcriptKind === 'command') {
      assert.equal(cell.type, 'code');
      assert.equal(cell.language, 'bash');
      assert.ok(
        !cell.content.startsWith('Bash(') && !cell.content.includes('⎿'),
        'command must not contain wrapper/output'
      );
      if (cell.content.includes('…')) assert.ok(meta.issues.includes('truncated'));
    }
    if (meta.transcriptKind === 'prose') assert.equal(cell.type, 'markdown');
    if (meta.transcriptKind === 'table') {
      assert.equal(cell.type, 'markdown');
      assert.ok(!/[┌┬┤└│]/.test(cell.content));
    }
    totals[meta.transcriptKind] = (totals[meta.transcriptKind] ?? 0) + 1;
  }
  // Independent, concrete expectations from the original research conversation.
  if (file.includes('015747')) {
    const model = typed.find((cell) => cell.content.startsWith('@dataclass\nclass Decision:'));
    assert.ok(model && model.type === 'code' && model.language === 'python');
    assert.ok(model.content.includes('    chosen: Candidate | None'));
    const signature = typed.find((cell) => cell.content.startsWith('def resolve('));
    assert.ok(signature?.metadata?.issues.includes('wrapped'));
    const table = typed.find((cell) => cell.metadata?.sourceLine === 620)!;
    assert.equal(table.metadata?.transcriptKind, 'table');
    assert.ok(table.content.includes('| 基线 | SQLAgent / ClaudeSQLAgent | 无 |'));
    assert.ok(table.content.includes('| A 组：ontology 上限 | *Doc | 规则文档 |'));
    assert.equal(table.content.split('\n').length, 6);
    assert.equal(
      typed.find((cell) => cell.metadata?.sourceLine === 560)?.metadata?.transcriptKind,
      'literal'
    );
  }
  if (file.includes('015944')) {
    const table = typed.find((cell) => cell.metadata?.sourceLine === 2430)!;
    assert.equal(
      table.content,
      '|  | Codex | Claude Code |\n| --- | --- | --- |\n| 正确 | 19 | 19 |\n| 只差 OWID 处理约定 | 12 | 9 |\n| 需求没说清 + OWID 约定 | 8 | 8 |\n| 只是需求没说清 | 2 | 7 |\n| gold 和输入（正文）矛盾 | 6 | 2 |\n| Agent 自己出错 | 1 | 3 |'
    );
    assert.ok(commands[0].outputs?.[0].content.startsWith('# OWID-GCB-Data-Task'));
  }
  const counts = Object.fromEntries(
    [...new Set(typed.map((cell) => cell.metadata!.transcriptKind))].map((kind) => [
      kind,
      typed.filter((cell) => cell.metadata!.transcriptKind === kind).length,
    ])
  );
  report.push(`## ${file}`, '', `检查通过。分类：${JSON.stringify(counts)}。`, '');
  for (const [kind, label] of [
    ['prose', '正文'],
    ['command', 'Bash 代码与输出'],
    ['file-preview', '文件内容预览'],
    ['diff', '文件 diff'],
    ['table', '表格'],
  ] as const) {
    const sample = typed.find((cell) => cell.metadata?.transcriptKind === kind);
    if (!sample) {
      report.push(`### ${label}`, '', '此文件没有识别到该类完整结构。', '');
      continue;
    }
    report.push(
      `### ${label} · L${sample.metadata!.sourceLine}`,
      '',
      `cell 类型：${sample.type}${sample.language ? ` / ${sample.language}` : ''}；问题标记：${sample.metadata!.issues.join(', ') || '无'}。`,
      ''
    );
    const excerpt = sample.content.slice(0, 1200);
    report.push(
      kind === 'table' || kind === 'prose' ? excerpt : `\`\`\`\`\`\`text\n${excerpt}\n\`\`\`\`\`\``
    );
    if (excerpt.length < sample.content.length)
      report.push('', '（报告只展示前 1200 字符，easynb 中保留全部已导出内容。）');
    if (sample.outputs?.length)
      report.push(
        '',
        '关联输出（节选）：',
        '',
        `\`\`\`\`\`\`text\n${String(sample.outputs[0].content).slice(0, 450)}\n\`\`\`\`\`\``
      );
    report.push('');
  }
}
report.splice(4, 0, `总计：${JSON.stringify(totals)}。`, '');
await writeFile(join(directory, 'semantic-verification.md'), report.join('\n'));
console.log(
  JSON.stringify(
    { files: files.length, totals, report: join(directory, 'semantic-verification.md') },
    null,
    2
  )
);
