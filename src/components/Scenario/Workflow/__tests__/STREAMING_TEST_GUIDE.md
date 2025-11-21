# Action 流式执行测试指南

## 测试前准备

### 1. 确认代码已更新
确保以下文件包含最新的流式执行代码：

- ✅ `AsyncStateMachineAdapter.ts` - 流式执行核心逻辑
- ✅ `CompleteBehaviorHandler.ts` - 移除重复执行
- ✅ `TransitionCoordinator.ts` - 添加 getContext() 方法
- ✅ `streaming-debug-logger.ts` - 调试日志工具

### 2. 检查依赖注入
确保以下组件正确初始化：

```typescript
// 在应用启动时
import { getTransitionCoordinator } from '@/components/Scenario/Workflow/transitions/TransitionCoordinator';
import { useScriptStore } from '@/components/Scenario/Workflow/store/useScriptStore';

// 注入 scriptStore 和 apiClient
const coordinator = getTransitionCoordinator();
coordinator.setContext({
  scriptStore: useScriptStore.getState(),
  apiClient: yourApiClientInstance
});
```

## 测试步骤

### 步骤 1: 打开浏览器控制台
1. 打开 Chrome DevTools (F12)
2. 切换到 Console 标签
3. 清空现有日志 (Ctrl+L 或 Cmd+K)

### 步骤 2: 触发 Workflow 执行
1. 在应用中启动一个 workflow
2. 确保 workflow 包含多个 actions（至少 3 个）
3. 观察控制台输出

### 步骤 3: 观察日志输出

#### 预期日志序列：
```
[AsyncFSM] Calling generating API for state: BEHAVIOR_RUNNING
[AsyncFSM] Starting streaming action execution...
[StreamLogger] 📝 Session started: generating-1234567890
[StreamLogger] 🌊 Streaming started

[AsyncFSM] Action received: add, executing immediately...
[StreamLogger] 📨 Action 1 received: add (+50ms from start, +0ms from prev)
[StreamLogger] ⚡ Action 1 execution started (waited 2ms)
[ScriptStore] Executing action: add
[StreamLogger] ✅ Action 1 completed: add (exec 15ms, total 17ms)
[AsyncFSM] Action 1 executed: add

[AsyncFSM] Action received: add, executing immediately...
[StreamLogger] 📨 Action 2 received: add (+150ms from start, +100ms from prev)
[StreamLogger] ⚡ Action 2 execution started (waited 1ms)
[ScriptStore] Executing action: add
[StreamLogger] ✅ Action 2 completed: add (exec 12ms, total 13ms)
[AsyncFSM] Action 2 executed: add

[AsyncFSM] Action received: exec, executing immediately...
[StreamLogger] 📨 Action 3 received: exec (+250ms from start, +100ms from prev)
[StreamLogger] ⚡ Action 3 execution started (waited 2ms)
[ScriptStore] Executing action: exec
[StreamLogger] ✅ Action 3 completed: exec (exec 85ms, total 87ms)
[AsyncFSM] Action 3 executed: exec

[StreamLogger] 🏁 Streaming ended (total 300ms, 3 actions)
[StreamLogger] 📋 Session ended: generating-1234567890

📊 Streaming Performance Report
=== Session Info ===
Session ID: generating-1234567890
Total time: 300ms
Total actions: 3

=== Actions Timeline ===
1. add                  | Received: +50ms | Waited: 2ms | Exec: 15ms | Interval: 0ms
2. add                  | Received: +150ms | Waited: 1ms | Exec: 12ms | Interval: 100ms
3. exec                 | Received: +250ms | Waited: 2ms | Exec: 85ms | Interval: 100ms

=== Performance Metrics ===
First action delay: 50ms
Avg action interval: 100.00ms
Max action interval: 100ms
Min action interval: 100ms
Avg execution time: 37.33ms
Max execution time: 85ms
Min execution time: 12ms

=== Issues Detection ===
✅ No issues detected

[AsyncFSM] Streaming execution complete: 3 actions
[CompleteBehavior] Applying actions transition: 3 actions received
[CompleteBehavior] Note: Actions are executed in streaming mode by AsyncStateMachineAdapter
```

### 步骤 4: 验证 UI 更新

#### 实时性检查：
1. ✅ 第一个 cell 是否在其他 cells 出现前就显示？
2. ✅ Cells 是否按顺序逐个出现？
3. ✅ 是否有"等待所有 actions 下载完"的延迟？

#### 观察 Network 标签：
1. 打开 Network 标签
2. 查找 API 请求（例如 `/api/workflow/generating`）
3. 检查响应类型：
   - ✅ 应该是 `text/event-stream` 或 chunked transfer
   - ❌ 如果是普通 JSON，说明不是流式

#### 使用 React DevTools：
1. 安装 React DevTools
2. 打开 Profiler
3. 开始记录
4. 触发 workflow
5. 停止记录
6. 检查：
   - Cells 的渲染时间是否分散？（流式）
   - 还是集中在最后？（批量）

## 测试场景

### 场景 A: 简单文本 Cells (3个)
```json
{
  "actions": [
    {"type": "add", "content": "# Step 1", "shot_type": "observation"},
    {"type": "add", "content": "# Step 2", "shot_type": "observation"},
    {"type": "add", "content": "# Step 3", "shot_type": "observation"}
  ]
}
```

**预期结果**:
- 首个 cell 延迟: < 100ms
- Action 间隔: 50-150ms
- 总时间: < 500ms
- UI: 逐个显示

### 场景 B: 代码生成 + 执行
```json
{
  "actions": [
    {"type": "add", "content": "print('hello')", "shot_type": "action"},
    {"type": "exec", "codecell_id": "lastAddedCellId", "need_output": true}
  ]
}
```

**预期结果**:
- Code cell 立即显示
- 执行开始（loading 状态）
- 输出显示
- 总时间取决于代码执行时间

### 场景 C: 包含 Thinking Cell
```json
{
  "actions": [
    {"type": "is_thinking", "textArray": ["Analyzing..."], "agentName": "AI"},
    {"type": "add", "content": "Analysis result", "shot_type": "observation"},
    {"type": "finish_thinking"}
  ]
}
```

**预期结果**:
- Thinking cell 立即显示
- Text cell 在 thinking 期间添加
- Thinking cell 被移除
- 流畅的动画过渡

## 问题诊断

### 问题 1: 日志显示批量执行
**症状**:
```
[AsyncFSM] Action received: add
[AsyncFSM] Action received: add
[AsyncFSM] Action received: add
// 然后才开始执行
[StreamLogger] Action 1 execution started
```

**原因**: API 不是真正的流式，而是批量返回

**解决**:
1. 检查 API client 实现
2. 验证后端是否支持 SSE
3. 检查 `fetchBehaviorActions` 是否正确处理流

### 问题 2: Actions 重复执行
**症状**:
```
[AsyncFSM] Action 1 executed: add
[CompleteBehavior] Executing action 1: add  // ← 重复!
```

**原因**: CompleteBehaviorHandler 仍在执行 actions

**解决**: 确认 CompleteBehaviorHandler.ts 已更新（不再调用 executeActions）

### 问题 3: 性能报告显示异常
**症状**:
```
⚠️ 3 slow actions (>1s)
⚠️ 2 long waits (>100ms)
```

**诊断**:
- Slow actions: action 执行本身慢（可能是正常的，如代码执行）
- Long waits: action 收到后等待太久才执行（不正常）

**解决**:
1. 检查是否有同步阻塞操作
2. 检查 scriptStore.execAction 是否真的是 async
3. 检查是否有 await 遗漏

### 问题 4: UI 不更新
**症状**: 控制台显示 actions 执行，但 UI 没有变化

**诊断**:
1. 检查 notebook store 是否正确更新
2. 检查 React 组件是否订阅了 store
3. 检查是否有渲染错误（React DevTools Console）

**解决**:
```typescript
// 在 addCell 中添加日志
addCell: (cellType, content, metadata) => {
  console.log('[NotebookStore] Adding cell:', cellType);
  // ... existing code
  console.log('[NotebookStore] Cell added, cells count:', get().cells.length);
}
```

## 成功标准 ✅

流式执行被认为是成功的，当：

1. ✅ **日志显示流式接收**:
   - Actions 逐个接收，而非批量
   - 接收和执行交替进行

2. ✅ **性能达标**:
   - 首个 action 延迟 < 200ms
   - Action 间隔 < 150ms（平均）
   - 无异常长等待（> 100ms）

3. ✅ **UI 实时更新**:
   - Cells 逐个出现
   - 无明显的"批量加载"感觉
   - 动画流畅

4. ✅ **正确性**:
   - 所有 actions 都执行
   - 无重复执行
   - 无错误或警告
   - FSM 状态正确转换

5. ✅ **性能报告清洁**:
   - "No issues detected"
   - 或只有合理的 slow actions（如代码执行）

## 调试技巧

### 技巧 1: 使用 Performance API
```typescript
// 在浏览器控制台
performance.mark('workflow-start');
// ... 触发 workflow
performance.mark('workflow-end');
performance.measure('workflow-total', 'workflow-start', 'workflow-end');
console.log(performance.getEntriesByType('measure'));
```

### 技巧 2: 模拟慢速网络
1. Chrome DevTools → Network 标签
2. 选择 "Slow 3G" 或自定义
3. 触发 workflow
4. 观察流式效果是否更明显

### 技巧 3: 导出日志数据
```typescript
// 在控制台
import streamingLogger from '@/components/Scenario/Workflow/__tests__/streaming-debug-logger';
console.log(streamingLogger.exportSessionData());
// 复制 JSON 数据用于分析
```

### 技巧 4: 断点调试
在以下位置设置断点：
- `AsyncStateMachineAdapter.ts:145` - action 接收
- `AsyncStateMachineAdapter.ts:172` - action 执行
- `useScriptStore.ts:127` - execAction 入口

## 下一步

测试完成后：

1. ✅ 记录测试结果
2. ✅ 截图性能报告
3. ✅ 修复发现的问题
4. ✅ 提交代码
5. ✅ 更新文档

## 联系和反馈

如有问题：
1. 检查控制台完整日志
2. 导出 streaming logger 数据
3. 记录重现步骤
4. 提交 issue
