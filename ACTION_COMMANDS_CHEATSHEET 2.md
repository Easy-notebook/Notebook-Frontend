# Action Commands 速查表

## 📚 基本命令

```bash
/help                    # 显示帮助信息
/list                    # 列出所有可用 actions
/<action> --help         # 显示特定 action 的帮助
```

## 🎯 最常用命令 (Top 10)

```bash
# 1. 切换视图模式
/update_view_mode step

# 2. 更新标题
/update_notebook_title "My Notebook"

# 3. 添加代码 cell
/add_cell --type code --content "print('hello')"

# 4. 更新 cell 内容
/tiptap_update --cellId cell-123 --content "New text"

# 5. 删除 cell
/delete_cell cell-123

# 6. 清空所有输出
/clear_outputs

# 7. 生成图片
/trigger_image_generation "A beautiful landscape"

# 8. 切换 phase
/update_current_phase phase-2

# 9. 运行代码
/runCurrentCodeCell

# 10. 设置当前 cell
/set_current_cell cell-123
```

## 📖 按类别分类

### 🖼️ Cell 管理
```bash
/add_cell --type <type> --content <content>
/update_cell --cellId <id> --content <content>
/delete_cell <cellId>
/clear_cells
/set_current_cell <cellId>
/clear_outputs
```

### ✏️ 内容编辑
```bash
/tiptap_update --cellId <id> --content <text>
/tiptap_update --cellId <id> --content <text> --replace true
/addNewContent2CurrentCell <content>
/updateCurrentCellWithContent <content>
```

### 🎨 内容生成
```bash
/trigger_image_generation <prompt>
/trigger_video_generation <prompt>
/trigger_webpage_generation <prompt>
```

### 🔄 视图控制
```bash
/update_view_mode <mode>              # create/step/demo
/update_allow_pagination <bool>
```

### 🔢 Workflow 管理
```bash
/update_current_phase <phaseId>
/update_current_step_index <index>
/set_running_phase <phaseId>
```

### ▶️ 代码执行
```bash
/runCurrentCodeCell
/setCurrentCellMode_complete
/setCurrentCellMode_onlyCode
/setCurrentCellMode_onlyOutput
```

### 🔀 Cell 转换
```bash
/convertCurrentCodeCellToHybridCell
/convertCurrentHybridCellToLinkCell
```

## 💡 语法规则

### 位置参数
```bash
/command_name argument1 argument2
/update_view_mode step
```

### 命名参数 (Flags)
```bash
/command_name --flag1 value1 --flag2 value2
/add_cell --type code --content "print(1)"
```

### 引号
```bash
# 多词参数必须用引号
/update_notebook_title "My Long Title"

# 单词可选
/update_view_mode step
/update_view_mode "step"
```

### Boolean 值
```bash
# 显式
--replace true
--replace false

# 简写 (存在即为 true)
--someFlag
```

## 🎓 实用模式

### 快速添加并编辑 Cell
```bash
/add_cell --type code --content "# TODO"
/set_current_cell <new-cell-id>
/tiptap_update --cellId <new-cell-id> --content "import pandas as pd"
```

### 切换模式并更新视图
```bash
/update_view_mode step
/update_current_step_index 0
```

### 生成内容工作流
```bash
/trigger_image_generation "Logo design for tech startup"
# 等待生成完成
/set_current_cell <image-cell-id>
```

## ⚠️ 常见错误

### ❌ 忘记引号
```bash
# 错误
/update_notebook_title My Long Title

# 正确
/update_notebook_title "My Long Title"
```

### ❌ 错误的 flag 格式
```bash
# 错误
/add_cell -type code

# 正确
/add_cell --type code
```

### ❌ 拼写错误
```bash
# 错误
/update_veiw_mode step

# 系统会提示
# Did you mean: /update_view_mode?
```

## 🔧 调试技巧

### 查看执行日志
打开浏览器控制台查看:
```
[ActionCommand] Success: /update_view_mode
[ActionCommand] Error: Failed to execute /add_cell
```

### 验证命令语法
```bash
# 使用 --help 检查参数
/add_cell --help
```

### 测试命令
```bash
# 使用简单参数测试
/update_view_mode create  # 简单测试
/clear_outputs             # 无参数命令测试
```

## 📊 命令执行流程

```
用户输入 → ActionCommandParser.parseCommand()
          ↓
       检查是否是 action command
          ↓
    /help, /list → 显示帮助信息
          ↓
    /<action> --help → 显示 action 帮助
          ↓
    获取 action 类
          ↓
    转换参数为 payload
          ↓
    执行 action
          ↓
    显示结果 toast
```

## 🚀 性能提示

- Action commands 本地执行，即时响应
- 不需要后端连接
- 适合快速 UI 操作
- 避免用于需要 AI 生成的复杂任务

## 📝 快速参考

| 需求 | 命令 |
|------|------|
| 查看所有命令 | `/list` |
| 获取帮助 | `/help` 或 `/<action> --help` |
| 切换模式 | `/update_view_mode <mode>` |
| 添加 cell | `/add_cell --type <type> --content <text>` |
| 删除 cell | `/delete_cell <id>` |
| 更新标题 | `/update_notebook_title "<title>"` |
| 生成图片 | `/trigger_image_generation "<prompt>"` |
| 运行代码 | `/runCurrentCodeCell` |
| 清空输出 | `/clear_outputs` |
| 切换步骤 | `/update_current_step_index <n>` |

---

**提示**: 在 AI Terminal 中输入 `/` 会自动显示命令补全建议！
