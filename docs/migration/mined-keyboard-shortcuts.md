# Mined keyboard shortcuts (from deleted `KeyboardShortcuts/useKeyboardShortcuts.ts`)

This hook was **not wired into the live editor** (no importers) and is deleted in Phase 0.
Its advertised shortcut list is preserved here to seed the Phase 3 command registry +
Phase 4 PM keymap (registry ids → keymap entries). Labels are the original zh-CN strings.

| Keys | Action (id hint) | Label |
|---|---|---|
| Ctrl/Cmd + S | `notebook.save` | 保存笔记本 |
| Ctrl/Cmd + Z | `history.undo` | 撤销 |
| Ctrl/Cmd + Y | `history.redo` | 重做 |
| Ctrl/Cmd + Shift + Z | `history.redo` | 重做 |
| Ctrl/Cmd + Shift + L | `insert.codeCell` | 插入代码块 |
| Ctrl/Cmd + Shift + M | `insert.markdownBlock` | 插入文本块 |
| Ctrl/Cmd + Shift + I | `insert.imageBlock` | 插入图片 |
| Ctrl/Cmd + Shift + T | `insert.table` | 插入表格 |
| Ctrl/Cmd + Shift + B | `insert.thinkingBlock` | 插入 AI 思考 |
| Ctrl/Cmd + Shift + E | `insert.math` | 插入数学公式 |
| Ctrl/Cmd + Enter | `cell.run` | 运行当前 cell |
| Ctrl/Cmd + Shift + Enter | `cell.runAll` | 运行所有 cells |
| Delete | `cell.delete` | 删除 cell |
| Enter | `cell.edit` | 编辑 cell |
| Esc | `cell.exitEdit` | 退出编辑 |
| ↑ | `nav.prevCell` | 选择上一个 cell |
| ↓ | `nav.nextCell` | 选择下一个 cell |
| Alt + ↑ | `cell.moveUp` | 向上移动 cell |
| Alt + ↓ | `cell.moveDown` | 向下移动 cell |
| Ctrl/Cmd + / | `palette.open` | 打开命令面板 |
| Ctrl/Cmd + Shift + P | `palette.open` | 打开命令面板 |

> Note: `ShortcutsHelp.tsx` (the help dialog) is still used by `JupyterNotebookEditor`
> and is retained until Phase 8 (legacy editor removal).
