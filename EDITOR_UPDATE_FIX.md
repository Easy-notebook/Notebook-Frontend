# 编辑器更新问题修复

## 问题描述

`/src/services/stream` 中的编辑器更新 actions（`UpdateCellAction` 和 `UpdateCellMetadataAction`）无法正确更新 TipTap 编辑器中的 code/hybrid cells。

## 根本原因

### 问题分析

1. **Code cells 在 TipTap 中是原子节点**
   - Code/hybrid cells 通过自定义的 `executableCodeBlock` 节点类型渲染
   - 节点内容存储在 `data-code` 属性中（URL编码）
   - 节点通过 React 组件 `CodeBlockView` 渲染

2. **之前的同步机制问题**
   - `useEditorSync` hook 检测到 cell content 变化
   - 调用 `editor.commands.setContent(expectedHtml, false)` **重新渲染整个文档**
   - 导致：
     - 所有节点被销毁并重新创建
     - 光标位置丢失
     - 用户输入被中断
     - 性能问题（文档很大时）

3. **为什么之前"不工作"**
   - 完整的文档重渲染会导致 React 组件被销毁并重新挂载
   - Code cell 内部的 Monaco Editor 状态丢失
   - 用户看不到平滑的内容更新

## 解决方案

### 1. 精确更新 Code Cell 节点

新增 `updateCodeCellNode()` 函数，使用 ProseMirror Transaction 直接更新节点属性：

```typescript
function updateCodeCellNode(
  editor: Editor,
  cellId: string,
  updates: { content?: string; outputs?: any[] }
): boolean {
  let targetPos: number | null = null;
  let targetNode: any = null;

  // 1. 查找目标节点
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'executableCodeBlock' && node.attrs.cellId === cellId) {
      targetPos = pos;
      targetNode = node;
      return false;
    }
  });

  // 2. 直接更新节点属性（不改变选择状态）
  if (targetPos !== null && targetNode) {
    const newAttrs = { ...targetNode.attrs };

    if (updates.content !== undefined) {
      newAttrs.code = encodeURIComponent(updates.content);
    }

    if (updates.outputs !== undefined) {
      newAttrs.outputs = encodeURIComponent(JSON.stringify(updates.outputs));
    }

    const { tr } = editor.state;
    tr.setNodeMarkup(targetPos, undefined, newAttrs);
    editor.view.dispatch(tr);

    return true;
  }

  return false;
}
```

### 2. 优化同步逻辑

重构 `useEditorSync` 以区分结构变化和内容变化：

```typescript
// 1. 检查结构变化（添加、删除、重排序）
const hasStructuralChange =
  cells.length !== lastCells.length ||
  cells.some((cell, index) => {
    const lastCell = lastCells[index];
    return !lastCell || cell.id !== lastCell.id || cell.type !== lastCell.type;
  });

// 2. 结构变化 → 完整重渲染
if (hasStructuralChange) {
  editor.commands.setContent(expectedHtml, false);
  return;
}

// 3. 内容变化 → 精确更新
cells.forEach((cell, index) => {
  const lastCell = lastCells[index];

  // Code/hybrid cells: 使用精确更新
  if (cell.type === 'code' || cell.type === 'hybrid') {
    const contentChanged = cell.content !== lastCell.content;
    const outputsChanged = /* ... */;

    if (contentChanged || outputsChanged) {
      updateCodeCellNode(editor, cell.id, {
        content: contentChanged ? cell.content : undefined,
        outputs: outputsChanged ? cell.outputs : undefined,
      });
    }
  }

  // 其他类型: 继续使用完整重渲染
  // ...
});
```

## 技术细节

### ProseMirror Transaction API

使用 `tr.setNodeMarkup()` 而不是 `editor.commands.updateAttributes()`：

- **优点**：
  - 不改变当前选择状态
  - 不触发不必要的副作用
  - 性能更好（只更新一个节点）

- **关键 API**：
  ```typescript
  const { tr } = editor.state;
  tr.setNodeMarkup(pos, type, attrs, marks);
  editor.view.dispatch(tr);
  ```

### 编码处理

Code cell 的 `data-code` 和 `data-outputs` 属性需要 URL 编码：

```typescript
newAttrs.code = encodeURIComponent(content);
newAttrs.outputs = encodeURIComponent(JSON.stringify(outputs));
```

这与 `cellConverters.ts` 中的编码方式保持一致。

## 修复文件

- **主要修改**: `src/components/Editor/TipTap/hooks/useEditorSync.ts`
  - 新增 `updateCodeCellNode()` 函数
  - 重构同步逻辑以区分结构变化和内容变化
  - Code/hybrid cells 使用精确更新，其他类型继续使用完整重渲染

## 效果

修复后：

1. ✅ **Code cell 内容更新平滑**
   - 不会重新挂载 Monaco Editor
   - 保持光标位置和编辑状态

2. ✅ **性能提升**
   - 避免重新渲染整个文档
   - 只更新变化的节点

3. ✅ **用户体验改善**
   - 不会中断用户输入
   - 视觉上更流畅

## 相关文件

- `src/components/Editor/TipTap/hooks/useEditorSync.ts` - 编辑器同步逻辑
- `src/components/Editor/extensions/CodeBlockExtension.tsx` - Code cell 节点定义
- `src/components/Editor/utils/cellConverters.ts` - Cell 转换工具
- `src/services/stream/actions/cell/UpdateCellAction.ts` - 更新 cell 内容的 action
- `src/services/stream/actions/cell/UpdateCellMetadataAction.ts` - 更新 cell metadata 的 action

## 测试建议

1. 测试 Stream Actions 更新 code cell 内容
2. 测试 Stream Actions 更新 code cell outputs
3. 测试在编辑 code cell 时接收更新（不应中断输入）
4. 测试添加/删除 cells（应触发完整重渲染）
5. 测试更新 markdown cells（应触发完整重渲染）

## 注意事项

- 这个修复只优化了 **code/hybrid cells** 的更新
- **Markdown、image、thinking 等其他类型**的 cells 仍然使用完整重渲染
- 如果需要优化其他类型，可以为它们实现类似的精确更新函数
