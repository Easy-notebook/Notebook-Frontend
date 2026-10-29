import type { Cell } from '@Store/models';

/** A reading label for observed local context changes, not executable AAL or a memory receipt. */
export class TranscriptContextChange {
  constructor(readonly cell: Cell) {}
  get description(): { label: string; target: string } {
    const text = this.cell.content.trim();
    const rules: [RegExp, string][] = [
      [/^Shell cwd was reset to\s+/, '工作目录恢复'],
      [/^Read\s+/, '读取文件'],
      [/^Referenced file\s+/, '引用文件'],
      [/^Skills restored\s*:?\s*/, '恢复技能'],
    ];
    for (const [pattern, label] of rules) {
      if (pattern.test(text))
        return { label, target: text.replace(pattern, '').replace(/\n\s*/g, '') };
    }
    return { label: '会话记录', target: text.replace(/\n\s*/g, ' ') };
  }
}
