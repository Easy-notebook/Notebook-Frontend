import React from 'react';
import '../../src/i18n';
import { createRoot } from 'react-dom/client';
import NotebookEditor from '../../src/components/Editor/Lexical/NotebookEditor';
import { NotebookOutline } from '../../src/components/Notebook/sections/LeftSidebar/Main/Workspace/OutlineView/NotebookOutline';
import useStore from '../../src/store/notebookStore';
import '../../src/index.css';
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext';
const cells = [
  { id: 'title', type: 'markdown', content: '# 编辑器与目录验证', outputs: [] },
  {
    id: 'intro',
    type: 'markdown',
    content:
      '## 研究方法\n\n保持原有组件，验证 **加粗**、*强调*、`行内代码` 和 [参考链接](https://example.com)。\n\n### 数据准备\n\n- 第一项\n- 第二项\n  - 子项目\n\n> 引用保留独立的段落与语义。\n\n#### 重复标题\n\n正文中的层级来自实际标题。\n\n##### 第五级\n\n###### 第六级',
    outputs: [],
  },
  {
    id: 'code',
    type: 'code',
    language: 'aal',
    content: 'agent Cell is Agent\n  public\n    ability run() -> Any\n      return 17 * 23',
    outputs: [],
  },
  {
    id: 'results',
    type: 'markdown',
    content:
      '## 结果\n\n| 指标 | 数值 |\n| --- | --- |\n| 样本 | 9 |\n\n### 重复标题\n\n这是另一个同名标题。\n\n---\n\n末尾段落。',
    outputs: [],
  },
];
useStore.setState({ notebookId: 'lexical-editor-fixture', cells, isLoaded: true });
const keyboardCells = [
  { id: 'key-title', type: 'markdown', content: '# 键盘回归', outputs: [] },
  { id: 'key-heading', type: 'markdown', content: '## 标题节点', outputs: [] },
  { id: 'key-before', type: 'markdown', content: '代码前段落', outputs: [] },
  { id: 'key-code', type: 'code', language: 'aal', content: 'alpha\nbeta', outputs: [] },
  { id: 'key-after', type: 'markdown', content: '代码后段落', outputs: [] },
  { id: 'key-list', type: 'markdown', content: '- 列表甲\n- 列表乙', outputs: [] },
  { id: 'key-tasks', type: 'markdown', content: '- [ ] 待办检查\n- [x] 已完成检查', outputs: [] },
  { id: 'key-quote', type: 'markdown', content: '> 引用节点', outputs: [] },
  {
    id: 'key-table',
    type: 'markdown',
    content: '| 表头甲 | 表头乙 |\n| --- | --- |\n| 单元甲 | 单元乙 |',
    outputs: [],
  },
  {
    id: 'key-science',
    type: 'markdown',
    content: '$$\nx^2\n$$\n\n```mermaid\ngraph TD\nA-->B\n```',
    outputs: [],
  },
  { id: 'key-raw', type: 'raw', content: 'raw sample', outputs: [] },
  {
    id: 'key-image',
    type: 'markdown',
    content: '![测试图片](/images/languages/easynet.webp)',
    outputs: [],
  },
  { id: 'key-end', type: 'markdown', content: '结束段落', outputs: [] },
];
function Probe() {
  const { resolvedTheme, setTheme } = useTheme();
  const [readOnly, setReadOnly] = React.useState(false);
  return (
    <>
      <div style={{ padding: 12, display: 'flex', gap: 12 }}>
        <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          切换主题
        </button>
        <button onClick={() => setReadOnly(!readOnly)}>切换只读</button>
        <button onClick={() => useStore.getState().setCells(keyboardCells)}>重置键盘回归</button>
        <button onClick={() => useStore.getState().setCells(cells)}>重置样式验证</button>
      </div>
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: '240px minmax(0,1fr)',
          height: 'calc(100vh - 60px)',
          gap: 16,
        }}
      >
        <aside>
          <NotebookOutline />
        </aside>
        <section style={{ overflow: 'auto' }}>
          <NotebookEditor readOnly={readOnly} />
        </section>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <Probe />
  </ThemeProvider>
);
