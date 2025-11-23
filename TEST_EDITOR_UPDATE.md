# 测试编辑器更新问题

## 测试步骤

### 1. 打开浏览器控制台并执行以下测试：

```javascript
// 导入必要的模块
const { default: useStore } = await import('./src/store/notebookStore.ts');
const { default: globalUpdateInterface } = await import('./src/interfaces/globalUpdateInterface.ts');

// 获取当前 cells
const cells = useStore.getState().cells;
console.log('Current cells:', cells.map(c => ({ id: c.id, type: c.type, content: c.content?.substring(0, 50) })));

// 如果有 code cell，测试更新
const codeCell = cells.find(c => c.type === 'code' || c.type === 'hybrid');
if (codeCell) {
  console.log('Found code cell:', codeCell.id);

  // 测试更新
  globalUpdateInterface.updateCell(codeCell.id, 'print("test update from console")');

  // 检查更新后的状态
  const updatedCells = useStore.getState().cells;
  const updatedCell = updatedCells.find(c => c.id === codeCell.id);
  console.log('Updated cell content:', updatedCell?.content);

  // 如果内容更新成功但编辑器没有显示，说明是 useEditorSync 的问题
} else {
  console.log('No code cell found, create one first');
}
```

### 2. 观察控制台输出

查找以下日志：

#### useEditorSync 的日志：
```
🔄 [useEditorSync] Effect triggered
🔄 [useEditorSync] Update check result
=== 外部cells变化，需要更新tiptap ===
=== tiptap内容已更新 ===
```

#### UpdateCellAction 的日志：
```
🔄 [UpdateCellAction] 更新cell的内容:
✅ 更新指定cell的内容:
✅ 指定cell内容更新完成
```

### 3. 检查问题所在

#### 情况A：能看到 UpdateCellAction 日志，但看不到 useEditorSync 日志
- **问题**: Zustand 状态更新没有触发 React 重渲染
- **可能原因**:
  1. `updateCell` 使用 immer 的 `produce`，但可能没有正确触发订阅
  2. TiptapNotebookEditor 没有正确订阅 cells 的变化
  3. `isInternalUpdate` 标志阻止了同步

#### 情况B：能看到两个日志，但编辑器没有更新
- **问题**: `editor.commands.setContent()` 没有生效
- **可能原因**:
  1. `convertCellsToHtml()` 编码问题
  2. TipTap 的 setContent 被某些插件拦截
  3. React 组件更新问题

#### 情况C：完全看不到 UpdateCellAction 日志
- **问题**: Stream action 没有被调用
- **可能原因**:
  1. Action 没有正确注册
  2. Stream handler 路由问题
  3. Stream 数据格式不匹配

### 4. 调试用的额外日志

在 `UpdateCellAction.execute()` 开头添加：
```typescript
console.log('[UpdateCellAction] RAW context:', context);
console.log('[UpdateCellAction] Store cells before update:', useStore.getState().cells.map(c => ({ id: c.id, content: c.content?.substring(0, 30) })));
```

在 `UpdateCellAction.execute()` 结尾添加：
```typescript
console.log('[UpdateCellAction] Store cells after update:', useStore.getState().cells.map(c => ({ id: c.id, content: c.content?.substring(0, 30) })));
```

在 `useEditorSync` effect 中添加：
```typescript
console.log('[useEditorSync] cells reference:', cells === lastCells);
console.log('[useEditorSync] cells identity check:', cells.map((c, i) => c === lastCells[i]));
```

## 关键检查点

1. **UpdateCellAction 是否被调用**：检查控制台是否有 `🔄 [UpdateCellAction]` 日志
2. **Zustand 状态是否更新**：执行 `useStore.getState().cells` 检查 content 是否变化
3. **useEditorSync 是否被触发**：检查是否有 `🔄 [useEditorSync] Effect triggered` 日志
4. **needsTiptapUpdate 是否为 true**：检查 Update check result 日志
5. **editor.commands.setContent 是否被调用**：检查是否有 `=== tiptap内容已更新 ===` 日志
6. **TipTap 编辑器 DOM 是否更新**：检查浏览器元素面板中的 `data-code` 属性是否变化

## 可能的根本原因

基于重构前后的对比，最可能的原因是：

### 1. `isInternalUpdate` 标志干扰

重构可能改变了 `isInternalUpdate` 的时序，导致：
- 当 `UpdateCellAction` 更新 store 时，`isInternalUpdate.current === true`
- `useEditorSync` 检查到 `isInternalUpdate.current === true`，跳过同步

**解决方案**：检查 `UpdateCellAction` 是否错误地设置了 `isInternalUpdate`

### 2. Zustand 订阅问题

`TiptapNotebookEditor` 中使用：
```typescript
const storeData = useStore();
const cells = useMemo(() => storeData?.cells ?? [], [storeData?.cells]);
```

如果 `useStore()` 没有正确订阅，`storeData.cells` 不会更新，导致：
- `cells` 引用不变
- `useEditorSync` 的 useEffect 不会触发

**解决方案**：改用 selector 订阅：
```typescript
const cells = useStore((state) => state.cells);
```

### 3. 异步时序问题

原代码使用 `await globalUpdateInterface.updateCell()`，但实际上 updateCell 是同步的。
重构后如果有任何异步操作干扰了执行顺序，可能导致问题。

**解决方案**：检查执行时序，确保 updateCell 后立即触发重渲染
