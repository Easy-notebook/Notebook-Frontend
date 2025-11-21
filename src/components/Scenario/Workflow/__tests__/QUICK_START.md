# 🚀 Quick Start: Testing Action Execution

## 最快的方式开始测试

### 方法 1: 浏览器控制台（推荐用于快速测试）

1. **打开浏览器控制台** (F12 或 Cmd+Option+I)

2. **初始化系统**:
```javascript
window.workflowInit.initialize()
```

3. **验证系统状态**:
```javascript
window.workflowInit.verify()
```

4. **测试单个 action**:
```javascript
await window.actionTest.testActionExecution({
  action: 'add',
  shotType: 'text',
  content: '# 你好世界',
  metadata: {}
})
```

5. **测试完整流程**:
```javascript
await window.actionTest.testBackendActionStream()
```

### 方法 2: React 组件测试（推荐用于可视化测试）

1. **在你的路由或测试页面中导入组件**:

```tsx
// 在 src/App.tsx 或任何路由文件中
import ActionExecutionDemo from '@/components/Scenario/Workflow/__tests__/ActionExecutionDemo';

function TestPage() {
  return (
    <div style={{ padding: 20 }}>
      <ActionExecutionDemo />
    </div>
  );
}
```

2. **访问测试页面**，点击按钮测试不同的 action 类型

3. **查看结果**:
   - 控制台日志
   - Notebook 中的 cells
   - UI 上的成功/失败状态

### 方法 3: 代码中直接调用

```typescript
import {
  testActionExecution,
  testActionFlow,
  createMockAction
} from '@/components/Scenario/Workflow/__tests__';
import workflowInit from '@/components/Scenario/Workflow/utils/workflowInitializer';

// 1. 初始化
workflowInit.initializeWorkflowSystem();

// 2. 测试单个 action
await testActionExecution({
  action: 'add',
  shotType: 'text',
  content: '# Chapter 1',
  metadata: { isChapter: true }
});

// 3. 测试多个 actions
await testActionFlow([
  createMockAction('chapter', { content: 'Chapter 1' }),
  createMockAction('add-text', { content: 'Introduction' }),
  createMockAction('add-code', { content: 'print("Hello")' })
]);
```

## 🎯 验证 Action 是否正确执行

### 检查清单

✅ **系统初始化成功**
```javascript
window.workflowInit.verify()
// 应该显示: { initialized: true, issues: [] }
```

✅ **Action 执行无错误**
```javascript
await window.actionTest.testActionExecution({...})
// 控制台应该显示: ✅ Action executed successfully
```

✅ **Cells 出现在 Notebook 中**
- 检查 Notebook UI
- 应该看到新添加的 cells

✅ **控制台日志正常**
```
[ScriptStore] Executing action: add
[ScriptStore] Cell added: <uuid>
✅ Action executed successfully
```

## 🐛 常见问题排查

### 问题 1: `window.workflowInit is undefined`

**原因**: 系统未加载或未初始化

**解决**:
1. 确保已导入 `workflowInitializer.ts`
2. 刷新页面
3. 查看控制台是否有错误

### 问题 2: `AsyncStateMachineAdapter not initialized`

**解决**:
```javascript
window.workflowInit.initialize()
```

### 问题 3: Actions 不执行

**检查步骤**:
1. 验证系统状态:
```javascript
const status = window.workflowInit.verify();
console.log(status);
```

2. 查看是否有 issues:
```javascript
if (status.issues.length > 0) {
  console.error('Issues:', status.issues);
}
```

3. 测试简单的 action:
```javascript
await window.workflowInit.testExecution();
```

## 📝 常用 Action 示例

### 添加文本 Cell
```javascript
await window.actionTest.testActionExecution({
  action: 'add',
  shotType: 'text',
  content: '这是一个文本 cell',
  metadata: {}
})
```

### 添加代码 Cell
```javascript
await window.actionTest.testActionExecution({
  action: 'add',
  shotType: 'action',
  content: 'import pandas as pd\ndf = pd.DataFrame()',
  metadata: {}
})
```

### 添加 Chapter
```javascript
await window.actionTest.testActionExecution({
  action: 'new_chapter',
  content: 'Chapter 1: Introduction',
  metadata: { isChapter: true }
})
```

### 添加 Thinking Cell
```javascript
await window.actionTest.testActionExecution({
  action: 'is_thinking',
  textArray: ['AI 正在思考...', '分析数据中...'],
  agentName: 'DataAnalyst'
})
```

### 执行代码
```javascript
// 先添加代码 cell
await window.actionTest.testActionExecution({
  action: 'add',
  shotType: 'action',
  content: 'print("Hello World")',
  metadata: {}
});

// 执行最后添加的 cell
await window.actionTest.testActionExecution({
  action: 'exec',
  codecell_id: 'lastAddedCellId',
  need_output: true
});
```

## 🎉 成功标志

当你看到以下输出时，说明 action 执行系统正常工作：

```
[WorkflowInit] Initializing workflow system...
[WorkflowInit] ScriptStore obtained
[WorkflowInit] StateMachine and TransitionCoordinator initialized
[WorkflowInit] AsyncStateMachineAdapter created
✅ [WorkflowInit] Workflow system initialized successfully

[ActionTest] Testing action: add
[ScriptStore] Executing action: add
[ScriptStore] Cell added: abc-123-def-456
✅ Action executed successfully
```

## 🔗 相关文档

- **详细指南**: [ACTION_EXECUTION_GUIDE.md](./ACTION_EXECUTION_GUIDE.md)
- **流式测试**: [STREAMING_TEST_GUIDE.md](./STREAMING_TEST_GUIDE.md)
- **代码参考**:
  - `action-execution-test.ts` - 测试工具
  - `workflowInitializer.ts` - 系统初始化
  - `ActionExecutionDemo.tsx` - 可视化组件

---

**需要帮助?** 打开浏览器控制台并运行:
```javascript
window.workflowInit.verify()
```
