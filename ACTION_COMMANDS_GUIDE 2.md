# Action Commands 使用指南

## 概述

Action Commands 提供了一个 CLI 风格的接口，允许你在 AI Terminal 中直接调用 stream actions，无需通过后端。

## 基本语法

```bash
/<action_type> [arguments] [--flag value]
```

## 快速开始

### 1. 查看所有可用命令

```bash
/list
```

这会显示所有 44 个可用的 stream actions。

### 2. 获取帮助

```bash
# 总体帮助
/help

# 特定 action 的帮助
/update_view_mode --help
/add_cell --help
/trigger_image_generation --help
```

## 常用命令示例

### 视图和导航

#### 切换视图模式
```bash
# 切换到 step 模式
/update_view_mode step

# 切换到 create 模式
/update_view_mode create

# 或使用 flag 方式
/update_view_mode --mode step
```

#### 更新 Notebook 标题
```bash
/update_notebook_title "My Data Analysis"

# 或
/update_notebook_title --title "Research Notes"
```

### Cell 操作

#### 添加新 Cell
```bash
# 添加代码 cell
/add_cell --type code --content "print('hello world')"

# 添加 markdown cell
/add_cell --type markdown --content "# My Title"

# 指定位置
/add_cell --type code --content "import pandas as pd" --position 0
```

#### 更新 Cell 内容
```bash
# 更新特定 cell
/update_cell --cellId cell-123 --content "new code here"

# TipTap 编辑器更新 (追加)
/tiptap_update --cellId cell-123 --content "Additional text"

# TipTap 编辑器更新 (替换)
/tiptap_update --cellId cell-123 --content "New text" --replace true

# 简写形式 (content 作为第一个参数)
/tiptap_update "More content" --cellId cell-123
```

#### 删除和清空
```bash
# 删除特定 cell
/delete_cell cell-123
/delete_cell --cellId cell-456

# 清空所有 cells
/clear_cells

# 清空所有输出
/clear_outputs
```

#### 选择 Cell
```bash
/set_current_cell cell-123
```

### 内容生成

#### 生成图片
```bash
# 基本用法
/trigger_image_generation "A beautiful sunset over mountains"

# 带命令 ID
/trigger_image_generation --prompt "Abstract art" --commandId cmd-123
```

#### 生成视频
```bash
/trigger_video_generation "A time-lapse of clouds moving"
```

#### 生成网页
```bash
/trigger_webpage_generation "A portfolio page with contact form and gallery"
```

### Workflow 管理

#### 切换 Phase
```bash
/update_current_phase phase-2
```

#### 切换 Step
```bash
/update_current_step_index 3
```

### 代码执行

#### 运行当前代码 Cell
```bash
/runCurrentCodeCell
```

#### 设置 Cell 显示模式
```bash
# 显示代码和输出
/setCurrentCellMode_complete

# 只显示代码
/setCurrentCellMode_onlyCode

# 只显示输出
/setCurrentCellMode_onlyOutput
```

### Cell 转换

```bash
# 代码 cell → Hybrid cell
/convertCurrentCodeCellToHybridCell

# Hybrid cell → Link cell
/convertCurrentHybridCellToLinkCell --url "https://example.com"
```

## 高级用法

### 使用引号处理多词参数

```bash
# 正确 ✓
/update_notebook_title "This is my long title"

# 错误 ✗
/update_notebook_title This is my long title  # 只会取 "This"
```

### Boolean Flags

```bash
# 显式 boolean 值
/tiptap_update --cellId cell-123 --content "text" --replace true

# 简写 (flag 存在即为 true)
/some_action --someFlag
```

### 数字参数

```bash
# 整数自动解析
/update_current_step_index 5

# 浮点数
/some_action --value 3.14
```

### JSON 对象参数

```bash
# 传递 JSON 对象
/add_cell --cell '{"type":"code","content":"print(1)","id":"custom-123"}'
```

## 所有可用 Actions 分类

### Cell Actions (11)
- `/addCell2EndWithContent`
- `/updateCurrentCellWithContent`
- `/updateCurrentCellMetadata`
- `/update_cell`
- `/add_cell`
- `/delete_cell`
- `/clear_cells`
- `/set_current_cell`
- `/clear_outputs`
- `/addNewContent2CurrentCell`
- `/addNewContent2CurrentCellDescription`

### QA Actions (3)
- `/initStreamingAnswer`
- `/addContentToAnswer`
- `/finishStreamingAnswer`

### Generation Actions (5)
- `/trigger_video_generation`
- `/trigger_image_generation`
- `/trigger_webpage_generation`
- `/video_generation_task_started`
- `/video_generation_status_update`

### Notebook Actions (1)
- `/update_notebook_title`

### View Actions (2)
- `/update_view_mode`
- `/update_allow_pagination`

### Phase Actions (4)
- `/update_current_phase`
- `/update_current_step_index`
- `/set_running_phase`
- `/addNewPhase2Next`

### Editor Actions (1)
- `/tiptap_update`

### Code Actions (4)
- `/runCurrentCodeCell`
- `/setCurrentCellMode_complete`
- `/setCurrentCellMode_onlyCode`
- `/setCurrentCellMode_onlyOutput`

### Convert Actions (2)
- `/convertCurrentCodeCellToHybridCell`
- `/convertCurrentHybridCellToLinkCell`

### Error Actions (2)
- `/error`
- `/set_error`

### Agent Actions (3)
- `/ask_agent_for_help`
- `/communicate_with_agent`
- `/remember_information`

### Workflow Actions (3)
- `/workflow_stage_changed`
- `/task_completed`
- `/task_failed`

### Link Actions (1)
- `/open_link_in_split`

### Misc Actions (1)
- `/ok`

## 实用技巧

### 1. 命令补全
在 AI Terminal 中输入 `/` 后，会显示常用命令建议。

### 2. 查看具体命令帮助
不确定某个命令的参数？使用 `--help`:
```bash
/add_cell --help
/trigger_image_generation --help
```

### 3. 快速测试
使用简单命令快速测试功能:
```bash
# 快速添加一个测试 cell
/add_cell --type code --content "# Test"

# 快速切换模式
/update_view_mode step
```

### 4. 组合使用
虽然每次只能执行一个命令，但可以快速连续执行多个命令来完成复杂操作。

## 错误处理

### 命令不存在
```bash
/unknown_command
# 输出: Unknown action: /unknown_command
# Did you mean: /update_view_mode, /update_cell?
```

### 参数错误
如果参数不正确，action 会抛出错误，请检查 `--help` 了解正确用法。

### 调试
所有命令执行都会在控制台输出日志:
```
[ActionCommand] Success: ...
[ActionCommand] Error: ...
```

## 与传统命令的区别

| 特性 | Action Commands | 传统 Commands |
|------|----------------|---------------|
| 执行方式 | 本地直接执行 | 发送到后端处理 |
| 响应速度 | 即时 | 需要网络往返 |
| 适用场景 | UI 操作、状态更新 | AI 生成、数据处理 |
| 可用性 | 离线可用 | 需要网络连接 |

## 开发者指南

### 添加新的 Action Command

如果你创建了新的 Stream Action，它会自动可用为命令。只需:

1. 创建 action 类 (如已有)
2. 注册 action: `registerStreamAction('your_action', YourActionClass)`
3. 命令立即可用: `/your_action`

### 自定义帮助文本

在 `ActionCommandParser.ts` 的 `getActionHelp()` 方法中添加你的 action 的帮助文本。

## 常见问题 (FAQ)

**Q: 命令区分大小写吗？**
A: 是的，action 名称必须完全匹配注册时的名称。

**Q: 可以一次执行多个命令吗？**
A: 不可以，每次只能执行一个命令。

**Q: 命令执行失败会怎样？**
A: 会显示错误信息，但不会影响其他功能。

**Q: 如何知道命令是否成功？**
A: 成功会显示 "✓ Executed: /action_name"，失败会显示错误详情。

## 总结

Action Commands 提供了一个强大、快速的方式来控制 Notebook 的各个方面。通过 CLI 风格的接口，你可以:

- ✅ 快速执行 44+ 个 stream actions
- ✅ 使用 `--help` 获取详细帮助
- ✅ 本地执行，无需后端
- ✅ 自动补全和错误提示

开始使用: 在 AI Terminal 输入 `/help` 或 `/list` 开始探索！
