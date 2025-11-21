# Action 流式执行测试文档

## 测试目标
验证 action 从 API 返回到 UI 显示的完整流程，确保每个 action 收到后立即执行。

## 架构概览

```
API (Generating/Reflecting)
  ↓ (async iterator)
GeneratingAPIHandler.call()
  ↓ (yields actions one by one)
AsyncStateMachineAdapter.step()
  ↓ (for await loop - streams)
  ├─ Receives action
  ├─ Executes immediately via scriptStore
  ├─ Collects for state update
  └─ Repeats for next action
  ↓ (all actions collected)
TransitionCoordinator.applyTransition()
  ↓
CompleteBehaviorHandler.apply()
  ↓ (actions already executed)
  └─ Only syncs notebook state
```

## 关键代码路径

### 1. API Handler (Streaming Source)
**文件**: `src/components/Scenario/Workflow/api/GeneratingAPIHandler.ts`

```typescript
async *call(...) {
  const iterator = this.apiClient.fetchBehaviorActions({...});

  for await (const action of iterator) {
    yield action;  // ← 流式返回每个 action
  }
}
```

**验证点**:
- ✅ 返回 AsyncIterator
- ✅ 逐个 yield actions
- ⚠️ 需要确认 `apiClient.fetchBehaviorActions` 是否真的是流式的

### 2. Async State Machine Adapter (Streaming Executor)
**文件**: `src/components/Scenario/Workflow/core/AsyncStateMachineAdapter.ts`

```typescript
// Line 130-175
if (apiType === 'generating' || apiType === 'reflecting') {
  if (typeof apiResponse[Symbol.asyncIterator] === 'function') {
    const scriptStore = coordinator.getContext().scriptStore;

    for await (const action of apiResponse) {
      // ← 收到一个 action

      if (scriptStore) {
        await scriptStore.execAction(executionStep);
        // ← 立即执行
      }

      actions.push(action);
      // ← 收集用于状态更新
    }
  }
}
```

**验证点**:
- ✅ 检测 async iterator
- ✅ 流式循环 `for await`
- ✅ 每个 action 立即执行
- ✅ 使用 `await` 确保执行完成
- ✅ 收集所有 actions 用于最后的状态更新

### 3. Script Store (Action Executor)
**文件**: `src/components/Scenario/Workflow/store/useScriptStore.ts`

```typescript
execAction: async (step: ExecutionStep): Promise<any> => {
  const actionType = step.action;

  switch (actionType) {
    case 'add':
      return get().addCell(...);
    case 'exec':
      return await get().execCodeCell(...);
    // ...
  }
}
```

**验证点**:
- ✅ 异步执行支持（async）
- ✅ 返回 Promise
- ⚠️ 需要确认每个 action 类型都能正确处理

### 4. Complete Behavior Handler (State Updater)
**文件**: `src/components/Scenario/Workflow/transitions/CompleteBehaviorHandler.ts`

```typescript
apply(state, apiResponse) {
  console.log('Actions are executed in streaming mode by AsyncStateMachineAdapter');

  // Actions 已经执行完毕，只同步状态
  this.syncNotebookToState(newState);
  this.updateFSMState(newState, 'BEHAVIOR_COMPLETED', 'COMPLETE_ACTION');
}
```

**验证点**:
- ✅ 不再重复执行 actions
- ✅ 只负责同步和状态更新

## 测试场景

### 场景 1: 生成 3 个文本 cells
**输入**: Generating API 返回 3 个 `add` actions

**预期行为**:
```
时间轴:
T+0ms:   API 返回 action 1 (add text)
T+10ms:  AsyncAdapter 收到 action 1
T+15ms:  执行 action 1 (addCell)
T+20ms:  Cell 1 显示在 UI
T+100ms: API 返回 action 2 (add text)
T+110ms: AsyncAdapter 收到 action 2
T+115ms: 执行 action 2 (addCell)
T+120ms: Cell 2 显示在 UI
T+200ms: API 返回 action 3 (add text)
T+210ms: AsyncAdapter 收到 action 3
T+215ms: 执行 action 3 (addCell)
T+220ms: Cell 3 显示在 UI
T+250ms: 所有 actions 收集完成
T+260ms: CompleteBehaviorHandler 同步状态
T+270ms: FSM 转换到 BEHAVIOR_COMPLETED
```

**关键观察点**:
- [ ] Cell 1 是否在 Cell 2 出现前就显示？
- [ ] Cell 2 是否在 Cell 3 出现前就显示？
- [ ] 总时间是否远小于批量执行（批量需要等 250ms 全部下载完）

### 场景 2: 生成代码 + 执行代码
**输入**:
1. Action 1: `add` (code cell)
2. Action 2: `exec` (execute code)

**预期行为**:
```
时间轴:
T+0ms:   收到 action 1 (add code)
T+10ms:  执行 action 1 → Code cell 显示
T+100ms: 收到 action 2 (exec)
T+110ms: 开始执行代码
T+500ms: 代码执行完成，输出显示
T+510ms: 状态同步完成
```

**关键观察点**:
- [ ] Code cell 是否在执行前就显示？
- [ ] 执行结果是否立即显示？
- [ ] 是否有执行状态指示（loading）

### 场景 3: 包含 thinking 的流式输出
**输入**:
1. Action 1: `is_thinking` (thinking cell)
2. Action 2: `add` (text)
3. Action 3: `finish_thinking` (remove thinking)

**预期行为**:
```
时间轴:
T+0ms:   收到 action 1 → Thinking cell 显示
T+100ms: 收到 action 2 → Text cell 显示（thinking 还在）
T+200ms: 收到 action 3 → Thinking cell 移除
```

**关键观察点**:
- [ ] Thinking cell 是否立即显示？
- [ ] Text 是否在 thinking 期间就添加？
- [ ] Thinking cell 是否正确移除？

## 潜在问题检查

### 问题 1: API Client 是否支持流式？
**检查**: `apiClient.fetchBehaviorActions` 的实现

**可能的问题**:
- API client 可能批量返回所有 actions（非流式）
- 后端 API 可能不支持 SSE/streaming

**验证方法**:
```typescript
// 在浏览器控制台查看网络请求
// 1. 打开 Network tab
// 2. 触发 behavior 执行
// 3. 查看 fetchBehaviorActions 请求
// 4. 检查响应是否是分块传输（chunked transfer）
```

### 问题 2: execAction 是否真的是 async？
**检查**: `useScriptStore.ts` 中的 `execAction` 实现

**可能的问题**:
- 某些 action 类型可能是同步的
- 返回值可能不是 Promise

**验证方法**:
```typescript
// 在 AsyncStateMachineAdapter 中添加日志
console.time('action-execution');
await scriptStore.execAction(executionStep);
console.timeEnd('action-execution');
```

### 问题 3: 是否有 race condition？
**场景**: 多个 actions 并发执行

**可能的问题**:
- Action 2 可能在 action 1 完成前开始执行
- Notebook state 可能不一致

**验证方法**:
- 检查 `await` 是否正确使用
- 检查 notebook store 是否支持并发更新

## 测试检查清单

### 代码检查
- [x] AsyncStateMachineAdapter 使用 `for await` 循环
- [x] 每个 action 使用 `await scriptStore.execAction()`
- [x] CompleteBehaviorHandler 不再重复执行 actions
- [ ] API client 返回 AsyncIterator
- [ ] scriptStore.execAction 是 async 方法
- [ ] 所有 action 类型都有对应的处理

### 运行时检查
- [ ] 控制台日志显示流式接收 actions
- [ ] 每个 action 的执行日志
- [ ] UI 实时更新（不等待所有 actions）
- [ ] 没有重复执行的警告
- [ ] 状态转换正确

### 性能检查
- [ ] 首个 action 延迟 < 200ms
- [ ] Action 间隔 < 100ms
- [ ] 总执行时间 < 批量执行时间的 50%

## 调试建议

### 1. 添加详细日志
在以下位置添加 console.log：

```typescript
// AsyncStateMachineAdapter.ts:140
console.log(`[Stream] Action ${actions.length + 1} received at ${Date.now()}`);

// AsyncStateMachineAdapter.ts:160
console.log(`[Stream] Action ${actions.length + 1} executed at ${Date.now()}`);

// useScriptStore.ts:127 (execAction 入口)
console.log(`[ScriptStore] Executing action: ${step.action} at ${Date.now()}`);

// useScriptStore.ts (execAction 出口)
console.log(`[ScriptStore] Action completed: ${step.action} at ${Date.now()}`);
```

### 2. 使用 Performance API
```typescript
// 在 AsyncStateMachineAdapter 中
performance.mark('stream-start');

for await (const action of apiResponse) {
  performance.mark(`action-${actions.length}-received`);
  await scriptStore.execAction(executionStep);
  performance.mark(`action-${actions.length}-executed`);
  performance.measure(
    `action-${actions.length}-execution`,
    `action-${actions.length}-received`,
    `action-${actions.length}-executed`
  );
}

performance.mark('stream-end');
performance.measure('total-streaming', 'stream-start', 'stream-end');
```

### 3. 使用 React DevTools
- Profiler 记录渲染时间
- Components 检查 cell 添加顺序
- 验证 state 更新时机

## 成功标准

流式执行被认为是成功的，当且仅当：

1. ✅ **即时性**: 首个 action 在 API 返回后 < 200ms 内显示在 UI
2. ✅ **顺序性**: Actions 按接收顺序执行和显示
3. ✅ **完整性**: 所有 actions 都被执行，无遗漏
4. ✅ **性能**: 总时间 < 批量执行时间的 70%
5. ✅ **正确性**: FSM 状态正确转换，notebook 状态一致
6. ✅ **无重复**: 每个 action 只执行一次

## 下一步

1. [ ] 验证 API client 的流式实现
2. [ ] 在本地运行测试场景 1
3. [ ] 记录实际时间线
4. [ ] 修复发现的问题
5. [ ] 运行完整测试套件
