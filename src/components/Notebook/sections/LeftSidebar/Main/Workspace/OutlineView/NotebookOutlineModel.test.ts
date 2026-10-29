import { describe, expect, it } from 'vitest';
import type { Cell } from '@Store/models';
import { NotebookOutlineModel } from './NotebookOutlineModel';
import { resolveOutlineTarget } from './useNotebookOutlineNavigation';

const md = (id: string, content: string): Cell => ({ id, type: 'markdown', content, outputs: [] });
describe('authored notebook outline', () => {
  it('uses real hierarchy, supports skipped levels, duplicates, Chinese, and all six heading levels', () => {
    const items = NotebookOutlineModel.project([
      md('title', '# 研究笔记'),
      md(
        'body',
        '## 方法\n\n#### **重复**\n\n###### 细节\n\n#### 重复\n\n## 结果\n\n### 结论\n\n##### 下一步'
      ),
    ]);
    expect(items.map((item) => item.title)).toEqual([
      '研究笔记',
      '方法',
      '重复',
      '细节',
      '重复',
      '结果',
      '结论',
      '下一步',
    ]);
    expect(items.map((item) => item.number)).toEqual([
      '',
      '1',
      '1.1',
      '1.1.1',
      '1.2',
      '2',
      '2.1',
      '2.1.1',
    ]);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(
      NotebookOutlineModel.visible(items, new Set(['body:0'])).map((item) => item.title)
    ).toEqual(['研究笔记', '方法', '结果', '结论', '下一步']);
  });
  it('excludes code fences and agent outputs while preserving nested authored headings', () => {
    const items = NotebookOutlineModel.project([
      md('body', '```md\n# Not a heading\n```\n\n> ### Quoted\n\n- #### Nested'),
      { id: 'code', type: 'code', content: '# code', outputs: [] },
    ]);
    expect(items.map((item) => item.title)).toEqual(['Quoted', 'Nested']);
  });
  it('does not mistake a multi-block first cell for the document title', () => {
    expect(NotebookOutlineModel.project([md('body', '# Heading\n\nBody')])[0].isTitle).toBe(false);
  });
  it('resolves duplicate headings by cell and ordinal rather than ambiguous IDs', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<div data-cell-id="body"><h2 id="same">Repeat</h2><h2 id="same">Repeat</h2></div>';
    const items = NotebookOutlineModel.project([md('body', '## Repeat\n\n## Repeat')]);
    expect(resolveOutlineTarget(root, items[1])).toBe(root.querySelectorAll('h2')[1]);
    expect(resolveOutlineTarget(root, { ...items[1], cellId: 'missing' })).toBe(null);
  });
});
