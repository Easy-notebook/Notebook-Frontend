# Action Commands 实现总结

## 概述

成功实现了 CLI 风格的 Action Commands 系统，允许用户在 AI Terminal 中直接调用所有 44 个 stream actions。

## 实现内容

### 1. 核心解析器 - `ActionCommandParser.ts`

**功能:**
- CLI 风格命令解析
- 支持位置参数和命名参数 (flags)
- 引号处理
- 类型自动推断 (boolean, number, string, JSON)
- 命令到 payload 的智能转换
- 内置帮助系统

**关键特性:**
```typescript
// 解析命令
parseCommand(command: string): ParsedCommand | null

// 转换为 payload
commandToPayload(parsed: ParsedCommand): any

// 执行命令
executeActionCommand(command: string, context): ActionCommandResult

// 帮助系统
getActionHelp(actionType: string): string
getGeneralHelp(): string

// 命令检测
isActionCommand(command: string): boolean
```

### 2. 集成处理器 - `ActionCommandHandler.ts`

**功能:**
- AI Terminal 集成层
- Toast 消息显示
- Notebook 上下文注入
- 命令自动补全建议

**核心方法:**
```typescript
handleCommand(command: string, showToast): Promise<boolean>
getCommandSuggestions(partial: string): string[]
```

### 3. AI Terminal 集成

**修改文件:** `src/components/Notebook/features/function-bar/AITerminal.tsx`

**集成点:** `handleSubmit` 函数

**逻辑流程:**
```
用户输入命令
    ↓
检查是否以 / 开头
    ↓
尝试 ActionCommandHandler.handleCommand()
    ↓
如果是 action command → 本地执行 → 显示结果
    ↓
如果不是 → 继续原有流程 → 发送到后端
```

## 支持的命令格式

### 1. 位置参数
```bash
/update_view_mode step
/delete_cell cell-123
/update_notebook_title "My Title"
```

### 2. 命名参数 (Flags)
```bash
/add_cell --type code --content "print('hello')"
/tiptap_update --cellId cell-123 --content "New text" --replace true
```

### 3. 混合格式
```bash
/tiptap_update "Quick content" --cellId cell-123
/trigger_image_generation "A sunset" --commandId cmd-123
```

### 4. 特殊命令
```bash
/help                        # 总体帮助
/list                        # 列出所有 actions
/<action> --help             # 特定 action 帮助
```

## 智能特性

### 1. 类型推断
```bash
# Boolean
--replace true     → boolean: true
--replace false    → boolean: false
--flag             → boolean: true

# Number
--index 5          → number: 5
--value 3.14       → number: 3.14

# JSON
--cell '{"type":"code"}' → object: {type: "code"}

# String (默认)
--content "text"   → string: "text"
```

### 2. 引号处理
```bash
# 单引号
/cmd 'single quoted text'

# 双引号
/cmd "double quoted text"

# 混合
/cmd --flag1 "value 1" --flag2 'value 2'
```

### 3. Payload 智能映射

不同 action 自动映射到正确的 payload 结构:

```typescript
// update_view_mode
/update_view_mode step
→ { mode: "step" }

// add_cell
/add_cell --type code --content "print(1)"
→ { cell: { type: "code", content: "print(1)", id: "cell-xxx" } }

// trigger_image_generation
/trigger_image_generation "A sunset"
→ { prompt: "A sunset" }
```

### 4. 错误提示和建议
```bash
# 未知命令
/update_veiw_mode step
→ Unknown action: /update_veiw_mode
→ Did you mean: /update_view_mode?

# 拼写错误
/add_cel --type code
→ Unknown action: /add_cel
→ Did you mean: /add_cell, /update_cell?
```

## 帮助系统

### 内置帮助文档

为以下 actions 提供了详细帮助:
- update_view_mode
- update_notebook_title
- add_cell
- update_cell
- tiptap_update
- trigger_image_generation
- trigger_video_generation
- trigger_webpage_generation
- delete_cell
- clear_cells
- clear_outputs
- set_current_cell
- update_current_phase
- update_current_step_index

### 帮助格式示例

```bash
/add_cell --help

Usage: /add_cell --type <type> --content <content>

Description: Add a new cell to the notebook

Flags:
  --type <type>         Cell type (code/markdown/hybrid)
  --content <content>   Cell content
  --id <id>             Optional cell ID
  --position <pos>      Position (start/end/number)

Examples:
  /add_cell --type code --content "print('hello')"
  /add_cell --type markdown --content "# Title" --position 0
```

## 文件结构

```
src/services/stream/commands/
├── ActionCommandParser.ts      # 核心解析器
├── ActionCommandHandler.ts     # AI Terminal 集成
└── index.ts                    # 导出

文档:
├── ACTION_COMMANDS_GUIDE.md           # 完整使用指南
├── ACTION_COMMANDS_CHEATSHEET.md      # 快速参考
└── ACTION_COMMANDS_IMPLEMENTATION.md  # 本文档
```

## 技术细节

### Token 解析算法

```typescript
tokenize(str: string): string[] {
  // 支持单引号和双引号
  // 正确处理空格分隔
  // 保留引号内的完整内容
}
```

**示例:**
```
输入: /cmd arg1 "arg 2" --flag 'value with spaces'
输出: ['cmd', 'arg1', 'arg 2', '--flag', 'value with spaces']
```

### Payload 转换逻辑

```typescript
commandToPayload(parsed: ParsedCommand): any {
  // 1. 从 flags 提取基础 payload
  // 2. 根据 action type 进行特殊处理
  // 3. 映射位置参数
  // 4. 清理冗余字段
}
```

### 上下文注入

```typescript
const context: StreamActionContext = {
  payload,                    // 从命令解析
  showToast,                  // AI Terminal 提供
  notebookId,                 // 从 notebookStore
  currentCellId,              // 从 notebookStore
  viewMode,                   // 从 notebookStore
  currentPhaseId,             // 从 notebookStore
  currentStepIndex,           // 从 notebookStore
};
```

## 使用统计

### 支持的 Actions

- **总数:** 44 个
- **有详细帮助:** 14 个
- **自动映射:** 所有
- **本地执行:** 所有

### 命令分类

| 分类 | 数量 | 示例 |
|------|------|------|
| Cell 操作 | 11 | add_cell, delete_cell |
| QA 管理 | 3 | initStreamingAnswer |
| 内容生成 | 5 | trigger_image_generation |
| 视图控制 | 2 | update_view_mode |
| Workflow | 4 | update_current_phase |
| 编辑器 | 1 | tiptap_update |
| 代码执行 | 4 | runCurrentCodeCell |
| 转换 | 2 | convertCurrentCodeCellToHybridCell |
| 错误处理 | 2 | error, set_error |
| Agent | 3 | ask_agent_for_help |
| 其他 | 7 | - |

## 优势

### 1. 性能
- ✅ 本地执行，无需网络往返
- ✅ 即时响应
- ✅ 离线可用

### 2. 用户体验
- ✅ CLI 风格，开发者友好
- ✅ 自动补全建议
- ✅ 详细错误提示
- ✅ 内置帮助系统

### 3. 可维护性
- ✅ 模块化设计
- ✅ 类型安全
- ✅ 易于扩展
- ✅ 自动发现新 actions

### 4. 灵活性
- ✅ 支持多种参数格式
- ✅ 智能类型推断
- ✅ 位置参数和命名参数混用
- ✅ 自定义 payload 映射

## 扩展性

### 添加新 Action 命令

新的 stream action 自动支持命令调用，无需额外配置:

```typescript
// 1. 创建并注册 action (已有)
export class MyNewAction extends StreamAction {
  async execute(context: StreamActionContext) {
    // 实现
  }
}
registerStreamAction('my_new_action', MyNewAction);

// 2. 命令立即可用
/my_new_action --param value

// 3. (可选) 添加帮助文档
// 在 ActionCommandParser.getActionHelp() 中添加
```

### 自定义 Payload 映射

为特殊 action 添加自定义映射:

```typescript
// ActionCommandParser.commandToPayload()
case 'my_new_action':
  if (args[0]) payload.customField = args[0];
  // 特殊处理逻辑
  break;
```

## 测试建议

### 单元测试
```typescript
describe('ActionCommandParser', () => {
  it('should parse simple command', () => {
    const result = ActionCommandParser.parseCommand('/update_view_mode step');
    expect(result.actionType).toBe('update_view_mode');
    expect(result.args[0]).toBe('step');
  });

  it('should parse flags', () => {
    const result = ActionCommandParser.parseCommand(
      '/add_cell --type code --content "hello"'
    );
    expect(result.flags.type).toBe('code');
    expect(result.flags.content).toBe('hello');
  });
});
```

### 集成测试
```typescript
describe('ActionCommandHandler', () => {
  it('should execute action command', async () => {
    const showToast = jest.fn();
    const result = await ActionCommandHandler.handleCommand(
      '/update_view_mode step',
      showToast
    );
    expect(result).toBe(true);
    expect(showToast).toHaveBeenCalledWith({
      message: expect.stringContaining('Executed'),
      type: 'success',
    });
  });
});
```

## 已知限制

1. **一次只能执行一个命令**
   - 不支持命令链: `/cmd1 && /cmd2`
   - 解决方案: 快速连续执行多个命令

2. **参数值不支持特殊字符转义**
   - 引号内的引号需要使用不同类型: `"text with 'quotes'"`

3. **命令历史**
   - 目前没有命令历史记录
   - 未来可以添加 ↑/↓ 键历史导航

## 未来改进

### 短期 (v1.1)
- [ ] 命令历史记录
- [ ] Tab 自动补全
- [ ] 更多 action 的详细帮助文档
- [ ] 参数验证

### 中期 (v1.2)
- [ ] 命令别名系统
- [ ] 命令组合/管道
- [ ] 保存常用命令为快捷方式
- [ ] 交互式参数输入

### 长期 (v2.0)
- [ ] 命令宏录制
- [ ] 批量命令脚本
- [ ] 命令调试模式
- [ ] 性能分析

## 结论

Action Commands 系统成功为 Notebook 提供了一个强大、灵活、易用的 CLI 接口。通过:

- ✅ 完整的 44 个 action 支持
- ✅ 智能参数解析
- ✅ 内置帮助系统
- ✅ 本地即时执行

用户现在可以通过简单的命令行格式快速控制 Notebook 的所有功能，大大提升了开发效率和用户体验。

---

**文档版本:** 1.0
**创建日期:** 2025-01-23
**维护者:** Stream Actions Team
