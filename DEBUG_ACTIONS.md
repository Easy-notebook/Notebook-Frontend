# Action Execution Debug Guide

## 问题诊断

从控制台日志看，actions **实际上是在执行的**：

```
[StreamLogger] ✅ Action 1 completed: add-text (exec 22ms, total 22ms)
[AsyncFSM] Action 1 executed: add-text
```

## Action 执行流程

1. **PlanningAPIHandler** (不执行actions)
   - 位置: `src/components/Scenario/Workflow/api/PlanningAPIHandler.ts:57`
   - 只 yield actions，不执行

2. **AsyncStateMachineAdapter** (执行actions)
   - 位置: `src/components/Scenario/Workflow/core/AsyncStateMachineAdapter.ts:158-180`
   - 通过 `scriptStore.execAction()` 执行每个 action
   - 代码:
     ```typescript
     if (scriptStore) {
       const executionStep = this.convertActionToExecutionStep(action);
       await scriptStore.execAction(executionStep);
     }
     ```

3. **ScriptStore.execAction()** (查找并执行action)
   - 位置: `src/components/Scenario/Workflow/store/useScriptStore.ts:173-259`
   - 从 action registry 获取 action class
   - 创建实例并调用 `execute()`

## 已发现的问题

### 1. ✅ Field Mapping 问题（已修复）
- **问题**: `plan_step`, `plan_stage` 等 actions 缺少字段
- **原因**: `convertActionToExecutionStep` 缺少 field mapping
- **修复**: 添加了 `stage_id → stageId`, `total_steps → totalSteps` 等映射

### 2. Action 注册状态检查

运行以下代码检查 action 是否正确注册:

```javascript
// 在浏览器控制台运行
const { getAllActionTypes } = await import('./src/components/Scenario/Workflow/actions');
console.log('Registered actions:', getAllActionTypes());

// 应该包含:
// ['add', 'add-text', 'new_chapter', 'new_section', 'new_step', 'comment-result',
//  'exec', 'set_effect_as_thinking', 'is_thinking', 'finish_thinking',
//  'update_title', 'update_last_text', 'plan_stage', 'complete_workflow_planning',
//  'plan_step', 'update_stage_context', 'complete_stage_planning', 'delegate_task', 'complete_step_planning']
```

## 可能的问题

### 如果 add-text 看起来"没执行"

1. **检查 Notebook Store 状态**
   ```javascript
   // 在浏览器控制台
   import useNotebookStore from '@Store/notebookStore';
   const state = useNotebookStore.getState();
   console.log('Cells:', state.cells);
   ```

2. **检查是否被追加到现有 cell**
   - `AddAction` 会将内容追加到最后一个非标题的 markdown cell
   - 查看日志: `[AddAction] ✅ Appended to existing cell: xxx`

3. **检查 UI 更新**
   - Notebook 可能需要刷新才能看到变化
   - 检查 `viewMode` 是否正确

### 如果 plan_step 不执行

1. **检查字段是否正确传递**
   ```javascript
   // 在 PlanStepAction.ts:27 添加 console.log
   console.log('[PlanStepAction] Received:', { stepId, title, task, acceptance });
   ```

2. **检查 WorkflowStateMachine 状态**
   ```javascript
   import { useWorkflowStateMachine } from '@/components/Scenario/Workflow/store/workflowStateMachine';
   const state = useWorkflowStateMachine.getState();
   console.log('Planned steps:', state.stateJSON.observation.location.progress.steps.planned);
   ```

## Debug 建议

1. **增强日志输出**
   在 `AsyncStateMachineAdapter.ts:166` 后添加:
   ```typescript
   console.log(`[AsyncFSM] Executing action step:`, executionStep);
   console.log(`[AsyncFSM] Action content:`, executionStep.content?.substring(0, 100));
   ```

2. **检查 action 执行结果**
   在 `ScriptStore.execAction:236` 后添加:
   ```typescript
   console.log(`[ScriptStore] Action ${actionType} result:`, result);
   ```

3. **监控 store 变化**
   ```javascript
   // 监控 notebook store 变化
   useNotebookStore.subscribe(
     (state) => state.cells,
     (cells) => console.log('Cells updated:', cells.length)
   );
   ```

## 常见误解

- ❌ "PlanningAPIHandler 应该执行 actions"
  - ✅ 不，它只负责 streaming，执行由 AsyncStateMachineAdapter 负责

- ❌ "add-text 没执行"
  - ✅ 它执行了，但可能被追加到现有 cell 而不是创建新 cell

- ❌ "plan_step 没有保存"
  - ✅ 它保存到 WorkflowStateMachine 的 stateJSON，不是 notebook cells

## 下一步

1. 检查浏览器控制台的完整日志
2. 确认所有 actions 都显示 "✅ Action X completed"
3. 检查 Notebook UI 是否正确显示内容
4. 如果还有问题，提供完整的错误堆栈
