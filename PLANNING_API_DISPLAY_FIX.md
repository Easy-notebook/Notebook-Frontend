# Planning API Display Fix - 问题诊断与修复

## 问题描述

Planning API 的 streaming actions（如 `add-text`, `plan_step` 等）**确实在执行**，但是**内容没有显示在前端**。

## 根本原因

问题不在于 `/services/stream`（这个是用于普通操作的 stream service，与 Planning API 无关）。

真正的问题是：**在 Planning API 执行期间，有多个导航操作干扰了内容显示**。

### 干扰因素

1. **自动导航（useNotebookEffects.ts:102-111）**
   - 当第一个 cell 被创建时（cells.length 从 0 变成 1）
   - `useNotebookEffects` 会自动导航到 workspace
   - 导航会触发 notebook 重新加载，**覆盖 Planning API 正在添加的内容**

2. **手动导航（AICommandInput.tsx:403）**
   - `startWorkflow()` 执行后，代码会立即导航到 workspace
   - 这也会导致 notebook 重新加载

### 执行流程（修复前）

```
1. 用户提交命令
2. Planning API 开始执行，创建第一个 cell ← ✅ add-text 执行成功
3. cells.length: 0 → 1 触发 useNotebookEffects
4. 自动导航到 workspace ← ❌ notebook 重新加载
5. Planning API 继续执行，添加更多内容
6. AICommandInput 手动导航到 workspace ← ❌ notebook 再次重新加载
7. 结果：用户看不到 Planning API 添加的内容
```

## 修复方案

### 1. 添加 `isExecuting` 标志控制

**文件：`src/components/Scenario/Workflow/store/workflowStateMachine.ts`**

在 `startWorkflow()` 开始时设置 `notebookStore.isExecuting = true`：
```typescript
// Set isExecuting flag in notebookStore to prevent auto-navigation during workflow
const { default: useNotebookStore } = await import('@Store/notebookStore');
useNotebookStore.getState().isExecuting = true;
console.log('[FSM] Set notebookStore.isExecuting = true');
```

在 workflow 暂停/完成时重置标志：
```typescript
} finally {
  // Reset isExecuting flag when workflow execution pauses or completes
  useNotebookStore.getState().isExecuting = false;
  console.log('[FSM] Set notebookStore.isExecuting = false');
}
```

### 2. 在 workflow 执行期间禁用自动导航

**文件：`src/components/Notebook/hooks/useNotebookEffects.ts`**

修改自动导航逻辑，检查 `isExecuting` 标志：
```typescript
// Auto-navigate to workspace when notebook is created in EmptyState
// Skip auto-navigation during workflow execution to prevent interrupting streaming actions
useEffect(() => {
  if (routeView === 'empty' && notebookId && cells.length > 0 && !isExecuting) {
    uiLog.info('EmptyState: Auto-navigating to workspace', {
      notebookId,
      cellCount: cells.length,
    });
    setTimeout(() => {
      navigateToWorkspace(notebookId);
    }, 100);
  } else if (isExecuting && cells.length > 0) {
    uiLog.debug('EmptyState: Skipping auto-navigation during workflow execution', {
      notebookId,
      cellCount: cells.length,
    });
  }
}, [routeView, notebookId, cells.length, isExecuting, navigateToWorkspace]);
```

### 3. 移除手动导航

**文件：`src/components/Scenario/State/EmptyState/AICommandInput.tsx`**

移除 `startWorkflow()` 后的手动导航逻辑：
```typescript
await useWorkflowStateMachine.getState().startWorkflow(planningRequest);
console.log('[AICommandInput] Workflow started successfully via new architecture');

// Navigation will be handled automatically by useNotebookEffects
// after workflow execution completes and isExecuting becomes false
console.log('[AICommandInput] Workflow execution in progress, navigation will happen automatically');
```

## 执行流程（修复后）

```
1. 用户提交命令
2. notebookStore.isExecuting = true ← ✅ 设置执行标志
3. Planning API 开始执行，创建第一个 cell ← ✅ add-text 执行成功
4. cells.length: 0 → 1 触发 useNotebookEffects
5. 检查 isExecuting === true，跳过自动导航 ← ✅ 不干扰执行
6. Planning API 继续执行，添加更多内容 ← ✅ 所有内容正常添加
7. Planning API 完成，notebookStore.isExecuting = false
8. cells.length 变化触发 useNotebookEffects
9. 检查 isExecuting === false，执行自动导航 ← ✅ 现在导航
10. 结果：用户看到完整的 Planning API 内容 ✅
```

## 其他修复（之前已完成）

### Field Mapping 问题

**文件：`src/components/Scenario/Workflow/core/AsyncStateMachineAdapter.ts`**

添加了缺失的字段映射：
- `stage_id → stageId`
- `total_steps → totalSteps`
- `total_stages → totalStages`

### Action 字段访问

更新了以下 action 类以支持 camelCase 字段：
- `PlanStepAction.ts`
- `PlanStageAction.ts`
- `CompleteStagePlanningAction.ts`
- `CompleteWorkflowPlanningAction.ts`

## 验证测试

修复后，测试以下场景：

1. ✅ 在 EmptyState 提交 VDS 命令
2. ✅ Planning API 执行，添加 cells
3. ✅ 在执行期间不应该有导航
4. ✅ 执行完成后自动导航到 workspace
5. ✅ Workspace 显示完整的 Planning 内容

## 关键概念澄清

### Stream Service vs Workflow Actions

- **Stream Service** (`/src/services/stream`)
  - 用于处理普通操作的流式响应（QA、Cell 操作等）
  - 通过 `operatorStore.ts` 调用
  - 与 Planning API 无关

- **Workflow Actions** (`/src/components/Scenario/Workflow/actions`)
  - 用于处理 Planning/Generating/Reflecting API 的流式响应
  - 通过 `ScriptStore.execAction()` 调用
  - Planning API 使用这个系统

### Planning API Actions 确实在执行

从控制台日志可以看到：
```
[StreamLogger] ✅ Action 1 completed: add-text (exec 22ms, total 22ms)
[AsyncFSM] Action 1 executed: add-text
[AddAction] ✅ Appended to existing cell: xxx
```

问题不是 actions 没执行，而是执行的结果被导航操作覆盖了。

## 总结

- ✅ Planning API 的 actions **一直在正常执行**
- ❌ 问题是**导航干扰导致内容被覆盖**
- ✅ 修复方法：**使用 isExecuting 标志控制导航时机**
- ✅ 修复后，Planning API 的内容会正常显示在前端
