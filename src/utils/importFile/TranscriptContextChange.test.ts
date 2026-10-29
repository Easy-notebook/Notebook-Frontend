import { expect, it } from 'vitest';
import { TranscriptContextChange } from './TranscriptContextChange';
it('labels observed context without changing raw text or inventing execution', () => {
  for (const [content, label, target] of [
    ['Shell cwd was reset to /work', '工作目录恢复', '/work'],
    ['Read /work/long-na\n     me.py (79 lines)', '读取文件', '/work/long-name.py (79 lines)'],
    ['Referenced file /work/evidence.md', '引用文件', '/work/evidence.md'],
    ['Skills restored: analysis', '恢复技能', 'analysis'],
    ['Background command complete', '会话记录', 'Background command complete'],
  ]) {
    const cell = { id: 'status', type: 'markdown' as const, content, outputs: [] };
    expect(new TranscriptContextChange(cell).description).toEqual({ label, target });
    expect(cell.content).toBe(content);
  }
});
