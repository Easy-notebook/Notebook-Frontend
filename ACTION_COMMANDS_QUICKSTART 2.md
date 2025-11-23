# Action Commands - 5分钟快速入门

## 什么是 Action Commands?

在 AI Terminal 中直接调用 Notebook 功能的命令行接口，无需通过后端，即时执行。

## 🚀 立即开始

### 1. 打开 AI Terminal

按 `Cmd+K` (Mac) 或 `Ctrl+K` (Windows/Linux)

### 2. 输入你的第一个命令

```bash
/list
```

会显示所有 44 个可用命令！

### 3. 尝试添加一个 Cell

```bash
/add-cell --type markdown --content "# Hello World"
```

✅ 成功！你刚创建了一个 markdown cell！

## 💡 核心概念

### 命令格式

```bash
/命令名 [参数] [--选项 值]
```

### 实时提示

输入 `/add-` 时，会自动显示：
- ✅ 命令描述
- ✅ 需要什么参数
- ✅ 参数类型
- ✅ 使用示例

**你不需要记住所有命令，只需要开始输入，系统会提示你！**

## 📝 最常用的 10 个命令

### 1. 添加内容
```bash
# 添加代码 cell
/add-cell --type code --content "print('Hello')"

# 添加笔记
/add-cell --type markdown --content "# 我的笔记"
```

### 2. 切换视图
```bash
# 切换到 step 模式
/update-view-mode step

# 切换到 create 模式
/update-view-mode create
```

### 3. 修改标题
```bash
/update-notebook-title "数据分析项目"
```

### 4. 生成图片
```bash
/trigger-image-generation "一个美丽的日落"
```

### 5. 清空输出
```bash
/clear-outputs
```

### 6. 删除 cell
```bash
/delete-cell cell-123
```

### 7. 运行代码
```bash
/runCurrentCodeCell
```

### 8. 更新内容
```bash
/tiptap-update --cellId cell-123 --content "新内容"
```

### 9. 切换阶段
```bash
/update-current-phase phase-2
```

### 10. 获取帮助
```bash
/help
```

## 🎯 实用技巧

### 技巧 1: 用引号处理空格
```bash
# ✅ 正确
/update-notebook-title "My Long Title"

# ❌ 错误
/update-notebook-title My Long Title
```

### 技巧 2: 短横线和下划线通用
```bash
/add-cell      # ✅ 可以
/add_cell      # ✅ 也可以
```

### 技巧 3: 使用 --help 查看详细说明
```bash
/add-cell --help
```

会显示：
- 完整用法
- 所有参数
- 多个示例

### 技巧 4: 位置参数简写
```bash
# 完整版
/update-view-mode --mode step

# 简写版（推荐）
/update-view-mode step
```

### 技巧 5: 查看建议
输入部分命令，系统会自动建议：
```bash
/add-     → 建议: /add-cell, /addCell2EndWithContent, /addContentToAnswer
```

## 🎨 实时提示示例

输入 `/trigger-image-generation` 后会看到：

```
⌘ Command mode

/trigger-image-generation
Generate an image from text prompt

Usage:
/trigger-image-generation <prompt>

Parameters:
--prompt *  Image description (string)
--commandId Command tracking ID (string)

Examples:
/trigger-image-generation "A beautiful sunset"
/trigger-image-generation --prompt "Abstract art" --commandId cmd-123

💡 Tip: Use --help for detailed help, or /list to see all commands
```

## ⚡ 常见场景

### 场景 1: 快速记笔记
```bash
/add-cell "记住：明天开会" --type markdown
```

### 场景 2: 添加代码并运行
```bash
/add-cell --type code --content "import pandas as pd"
/runCurrentCodeCell
```

### 场景 3: 批量操作
```bash
/clear-outputs
/update-view-mode step
/update-current-step-index 0
```

### 场景 4: 生成内容
```bash
/trigger-image-generation "Logo for tech startup"
/trigger-webpage-generation "Portfolio page with gallery"
```

### 场景 5: 调试
```bash
/list                    # 查看所有命令
/add-cell --help         # 查看具体用法
/clear-cells             # 清空重试
```

## ❌ 常见错误

### 错误 1: 忘记引号
```bash
# ❌ 错误
/update-notebook-title My Project

# ✅ 正确
/update-notebook-title "My Project"
```

### 错误 2: 参数顺序
```bash
# ⚠️ 不推荐
/add-cell --content "code" --type code

# ✅ 推荐（更清晰）
/add-cell --type code --content "code"
```

### 错误 3: 拼写错误
```bash
/add-cel     # ❌ 系统会提示: Did you mean /add-cell?
```

## 🎓 进阶用法

### 使用 JSON 对象
```bash
/add-cell --cell '{"type":"code","content":"print(1)","id":"custom-123"}'
```

### Boolean 参数
```bash
# 显式
/tiptap-update --cellId cell-123 --content "text" --replace true

# 简写
/some-action --someFlag  # flag 存在即为 true
```

### 数字参数
```bash
/update-current-step-index 5      # 自动识别为数字
```

## 📚 下一步

### 5 分钟后
- ✅ 尝试 5-10 个常用命令
- ✅ 使用 `--help` 查看详细说明
- ✅ 查看实时提示学习参数

### 30 分钟后
- 📖 阅读 [完整指南](./ACTION_COMMANDS_GUIDE.md)
- 📖 查看 [速查表](./ACTION_COMMANDS_CHEATSHEET.md)
- 🎯 将命令集成到工作流

### 1 小时后
- 🚀 熟练使用所有常用命令
- 💡 发现提升效率的新方法
- 🎨 自定义你的命令使用方式

## 🆘 获取帮助

### 命令行内帮助
```bash
/help                    # 总体帮助
/list                    # 所有命令
/<command> --help        # 特定命令帮助
```

### 实时提示
开始输入任何命令，系统会自动显示参数和示例

### 文档
- **完整指南**: `ACTION_COMMANDS_GUIDE.md`
- **速查表**: `ACTION_COMMANDS_CHEATSHEET.md`
- **技术细节**: `ACTION_COMMANDS_IMPLEMENTATION.md`

## 🎯 记住这 3 点

1. **输入 `/` 开始** - 系统会提示你
2. **使用 `--help`** - 查看详细说明
3. **支持 `-` 和 `_`** - 选你喜欢的

## 🎉 开始使用！

现在打开 AI Terminal（`Cmd+K`），输入：
```bash
/help
```

开始你的 Action Commands 之旅！ 🚀

---

**💡 提示**: 不需要记住所有命令，实时提示会帮助你！
