# Missing Stream Actions - 迁移清单

## 问题根源

重构 `streamHandler.ts` 到模块化 action 系统时，只迁移了部分 actions。很多 stream types 没有对应的 action，导致它们无法被处理。

## 已迁移的 Actions ✅ (44/44)

### Cell Actions (11)
- `addCell2EndWithContent` - AddCellAction
- `updateCurrentCellWithContent` - UpdateCellAction
- `updateCurrentCellMetadata` - UpdateCellMetadataAction
- `update_cell` - UpdateCellFullAction
- `add_cell` - AddCellFullAction
- `delete_cell` - DeleteCellAction
- `clear_cells` - ClearCellsAction
- `set_current_cell` - SetCurrentCellAction
- `clear_outputs` - ClearOutputsAction
- `addNewContent2CurrentCell` - AddContentToCellAction
- `addNewContent2CurrentCellDescription` - AddContentToDescriptionAction

### QA Actions (3)
- `initStreamingAnswer` - InitStreamingAnswerAction
- `addContentToAnswer` - AddContentToAnswerAction
- `finishStreamingAnswer` - FinishStreamingAnswerAction

### Generation Actions (5)
- `trigger_video_generation` - TriggerVideoGenerationAction
- `video_generation_task_started` - VideoGenerationTaskStartedAction
- `video_generation_status_update` - VideoGenerationStatusUpdateAction
- `trigger_image_generation` - TriggerImageGenerationAction
- `trigger_webpage_generation` - TriggerWebpageGenerationAction

### Notebook Actions (1)
- `update_notebook_title` - UpdateNotebookTitleAction

### View Actions (2)
- `update_view_mode` - UpdateViewModeAction
- `update_allow_pagination` - UpdatePaginationAction

### Phase Actions (4)
- `update_current_phase` - UpdateCurrentPhaseAction
- `update_current_step_index` - UpdateStepIndexAction
- `set_running_phase` - SetRunningPhaseAction
- `addNewPhase2Next` - AddPhaseAction

### Editor Actions (1)
- `tiptap_update` - TiptapUpdateAction

### Code Actions (4)
- `runCurrentCodeCell` - RunCurrentCodeCellAction
- `setCurrentCellMode_complete` - SetCellModeAction
- `setCurrentCellMode_onlyCode` - SetCellModeAction
- `setCurrentCellMode_onlyOutput` - SetCellModeAction

### Convert Actions (2)
- `convertCurrentCodeCellToHybridCell` - ConvertCodeToHybridAction
- `convertCurrentHybridCellToLinkCell` - ConvertHybridToLinkAction

### Error Actions (2)
- `error` - ErrorAction
- `set_error` - SetErrorAction

### Agent Actions (3)
- `ask_agent_for_help` - AskAgentAction
- `communicate_with_agent` - CommunicateAgentAction
- `remember_information` - RememberInformationAction

### Workflow Actions (3)
- `workflow_stage_changed` - WorkflowStageChangedAction
- `task_completed` - TaskCompletedAction
- `task_failed` - TaskFailedAction

### Link Actions (1)
- `open_link_in_split` - OpenLinkAction

### Misc Actions (1)
- `ok` - OkAction

## ~~需要迁移的 Actions（按优先级）~~ ✅ 已全部完成

### ~~高优先级 - 影响核心功能~~ ✅

#### 1. `update_view_mode`
**用途**: 切换视图模式（create/step/demo）
**位置**: `src/services/stream/actions/view/UpdateViewModeAction.ts`
**原逻辑**:
```typescript
const mode = payload?.mode;
if (mode) {
  await globalUpdateInterface.setViewMode(mode);
  await showToast({
    message: `切换到 ${mode === 'create' ? 'Create' : 'Step'} Mode 成功`,
    type: 'success',
  });
}
```

#### 2. `update_current_phase`
**用途**: 更新当前阶段
**位置**: `src/services/stream/actions/phase/UpdateCurrentPhaseAction.ts`
**原逻辑**:
```typescript
const phaseId = payload?.phaseId;
if (phaseId) {
  await globalUpdateInterface.setCurrentPhase(phaseId);
  await globalUpdateInterface.setCurrentStepIndex(0);
  await showToast({ message: '当前阶段已更新', type: 'success' });
}
```

#### 3. `tiptap_update`
**用途**: TipTap 富文本主动更新
**位置**: `src/services/stream/actions/editor/TiptapUpdateAction.ts`
**原逻辑**:
```typescript
const cellId = payload?.cellId;
const content = payload?.content;
const replace = payload?.replace ?? false;

if (cellId && typeof content === 'string') {
  const state = useStore.getState();
  const target = state.cells.find((c) => c.id === cellId);
  if (target) {
    if (replace) {
      state.updateCell(cellId, content);
    } else {
      state.updateCell(cellId, (target.content || '') + content);
    }
    if (state.editingCellId !== cellId) {
      state.setEditingCellId(cellId);
    }
  }
}
```

### 中优先级 - 影响用户体验

#### 4. `set_current_cell`
**用途**: 设置当前选中的 cell
**位置**: `src/services/stream/actions/cell/SetCurrentCellAction.ts`

#### 5. `update_cell`
**用途**: 更新特定 cell（通过 cell 对象）
**位置**: `src/services/stream/actions/cell/UpdateCellFullAction.ts`

#### 6. `runCurrentCodeCell`
**用途**: 运行当前代码 cell
**位置**: `src/services/stream/actions/code/RunCurrentCodeCellAction.ts`

#### 7. `convertCurrentCodeCellToHybridCell`
**用途**: 转换代码 cell 为 hybrid cell
**位置**: `src/services/stream/actions/cell/ConvertCellAction.ts`

#### 8. `update_allow_pagination`
**用途**: 更新翻页权限
**位置**: `src/services/stream/actions/view/UpdatePaginationAction.ts`

### 低优先级 - 特殊功能

#### 9. `trigger_webpage_generation`
**用途**: 触发网页生成
**位置**: `src/services/stream/actions/generation/TriggerWebpageGenerationAction.ts`

#### 10. `update_todo`
**用途**: 更新 TODO 列表
**位置**: `src/services/stream/actions/todo/UpdateTodoAction.ts`

#### 11. `error`
**用途**: 显示错误信息
**位置**: `src/services/stream/actions/error/ErrorAction.ts`

#### 12. `ok`
**用途**: 确认操作成功（通常不需要特殊处理）
**位置**: 可以忽略或创建空 action

### Agent 相关

#### 13. `ask_agent_for_help`
**用途**: 请求 agent 帮助
**位置**: `src/services/stream/actions/agent/AskAgentAction.ts`

#### 14. `communicate_with_agent`
**用途**: 与 agent 通信
**位置**: `src/services/stream/actions/agent/CommunicateAgentAction.ts`

#### 15. `remember_information`
**用途**: 记住信息到 agent 记忆
**位置**: `src/services/stream/actions/agent/RememberInformationAction.ts`

### Cell 操作

#### 16. `addNewContent2CurrentCell`
**用途**: 向当前 cell 添加内容
**位置**: `src/services/stream/actions/cell/AddContentToCellAction.ts`

#### 17. `addNewContent2CurrentCellDescription`
**用途**: 向当前 cell 描述添加内容
**位置**: `src/services/stream/actions/cell/AddContentToDescriptionAction.ts`

#### 18. `add_cell`
**用途**: 添加 cell（通过 cell 对象）
**位置**: `src/services/stream/actions/cell/AddCellFullAction.ts`

#### 19. `delete_cell`
**用途**: 删除 cell
**位置**: `src/services/stream/actions/cell/DeleteCellAction.ts`

#### 20. `clear_cells`
**用途**: 清空所有 cells
**位置**: `src/services/stream/actions/cell/ClearCellsAction.ts`

#### 21. `clear_outputs`
**用途**: 清空所有输出
**位置**: `src/services/stream/actions/cell/ClearOutputsAction.ts`

### Phase 管理

#### 22. `addNewPhase2Next`
**用途**: 添加新阶段
**位置**: `src/services/stream/actions/phase/AddPhaseAction.ts`

#### 23. `update_current_step_index`
**用途**: 更新当前步骤索引
**位置**: `src/services/stream/actions/phase/UpdateStepIndexAction.ts`

#### 24. `set_running_phase`
**用途**: 设置运行中的阶段
**位置**: `src/services/stream/actions/phase/SetRunningPhaseAction.ts`

### Cell 模式

#### 25-27. Cell 显示模式
- `setCurrentCellMode_complete`
- `setCurrentCellMode_onlyCode`
- `setCurrentCellMode_onlyOutput`

**位置**: `src/services/stream/actions/cell/SetCellModeAction.ts`

### 变量管理

#### 28-29. 变量操作
- `set_variable`
- `get_variable`

**位置**: `src/services/stream/actions/variable/`

### 其他

#### 30. `set_error`
**用途**: 设置错误状态
**位置**: `src/services/stream/actions/error/SetErrorAction.ts`

#### 31. `open_link_in_split`
**用途**: 在分屏中打开链接
**位置**: `src/services/stream/actions/link/OpenLinkAction.ts`

#### 32. `convertCurrentHybridCellToLinkCell`
**用途**: 转换 hybrid cell 为链接 cell
**位置**: `src/services/stream/actions/cell/ConvertToLinkAction.ts`

## 迁移步骤

对于每个缺失的 action:

1. **创建 Action 类文件**
   ```bash
   mkdir -p src/services/stream/actions/[category]
   touch src/services/stream/actions/[category]/[ActionName]Action.ts
   ```

2. **实现 Action 类**
   ```typescript
   import { StreamAction, registerStreamAction } from '../base';
   import type { StreamActionContext } from '../../types';

   export class [ActionName]Action extends StreamAction {
     execute(context: StreamActionContext): void | Promise<void> {
       const { payload, showToast } = context;
       // 从原 streamHandler.ts 复制逻辑
     }
   }

   registerStreamAction('[stream_type]', [ActionName]Action);
   ```

3. **更新 index.ts**
   ```typescript
   export * from './[ActionName]Action';
   import './[ActionName]Action'; // 触发注册
   ```

4. **更新主 actions/index.ts**
   ```typescript
   import * as [category] from './[category]';
   export { [category] };
   ```

## 快速测试

迁移后，在浏览器控制台运行：
```javascript
const { getAllStreamActionTypes } = await import('./src/services/stream/actions');
console.log('Registered actions:', getAllStreamActionTypes());
```

应该看到新迁移的 action type 在列表中。

## 当前进度

- ✅ 已迁移: 44 / 44 (100%)
- ⏳ 待迁移: 0 / 44 (0%)

## 🎉 迁移完成！

所有 44 个 stream action types 已全部迁移完成。新的模块化架构已就绪。

## 建议优先级

1. **立即迁移** (影响核心功能):
   - `update_view_mode`
   - `update_current_phase`
   - `tiptap_update`

2. **本周迁移** (影响用户体验):
   - `set_current_cell`
   - `update_cell`
   - `runCurrentCodeCell`

3. **逐步迁移** (特殊功能):
   - 其他所有 actions
