# Agent 协作书写

## Goal 与验收

基于用户提供的 2026-10-30 录屏和截图，实现文档原位协作：Agent 先声明写作意图，目标区域显示灰色文字与具名光标；生成期间使用 Shiny Text 风格高光；实际写入成功后恢复正式正文。

- Agent 在生成前声明目标 cell 和基准版本，并冻结整个实际写入范围。
- 冻结区域仍可阅读、选择、复制；其他 cell 可继续编辑。
- 普通输入、跨 cell 删除、粘贴、拖动、代码编辑及程序化整体替换均不能绕过锁。
- 灰色意图、预览草稿、光标与动画属于临时视图，不进入正式正文、保存、导出或撤销数据。
- 协作者光标与用户 selection 独立；有草稿时位于草稿末尾，未生成草稿时位于意图起点。
- 成功、拒绝、失败、取消、Agent 被移除、切换 notebook 和 run 结束均释放相应操作。
- 保留已有工具接口、审批、版本检查和批量修改的备份要求。
- 本次不包含 cell 修订历史和跨设备多用户文档同步。

## 状态与所有权

`proposed → generating → proposed（已有审批等待）→ applying → 结束并移除`

无需审批等待时也可以 `proposed/generating → applying`。取消/失败直接结束并移除。
所有活动状态均持有 cell 范围锁，不使用持久化 `enableEdit` 表示临时冻结。

`AgentWriting` 唯一拥有活动操作、订阅和同步提交权限。操作绑定 notebook、run 独有 owner、cell 和不可复用操作 ID。
提交权限只存在于同步写入回调中，不跨 `await`。非正文的执行输出和 Agent 运行元数据可以独立更新。
同一 notebook 中重叠的 Agent 写入被拒绝，不同 cell 可以并行。

## 工具协议

- `propose_cell_edit({cellId, version, intent, stage?, draft?})`：读取 cell 后、生成替换内容前调用。`stage: planned` 显示静态灰色；默认 `writing` 显示工作高光。可再次调用更新意图或预览草稿。
- `update_cell(...)`：沿用原参数及审批；提交正式内容，清理对应操作。
- `cancel_cell_edit({cellId})`：放弃自己的提案，不改变正文。
- `apply_notebook_edits(...)`：沿用原备份、版本和审批要求，在等待审批时显示涉及 cell 的原位提案。

工具由共享 schema 自动提供给 Claude 与 Codex。系统提示要求先提案再生成，前端在收到完整工具调用时更新状态；当前协议不发送工具 JSON 的逐 token 增量。因此光标跟随声明的目标及已收到的草稿尾部，不伪造 token 级编辑进度。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `services/agent-writing/AgentWriting.ts` | 操作状态机、作用域、冲突检查和同步提交 |
| `protectNotebookWrites.ts` | 统一保护 store action 与 imperative setState |
| `NotebookAgentTools` / `AgentCellSession` | 版本校验、工具提案、已有审批和 run 清理 |
| `AgentWritingPlugin` | contenteditable 外的原位装饰、具名光标、Shiny Text 样式 |
| `AgentEditGuard` / `NotebookEditorSession` | 输入拦截及最终文档事务校验，拒绝非法修改后恢复合法编辑器状态 |
| `useCellEditAccess` | 原始文本、Markdown 源码、CodeMirror、Hybrid 和代码工具栏共享只读策略 |

不安装第二套协作文档 provider。现有 Lexical ↔ store 同步保持唯一所有者。以后引入 Yjs 时应替换其同步责任，不能简单叠加 CollaborationPlugin。

## 验证入口

- `src/services/agent-writing/AgentWriting.test.ts`：所有权、冲突、store 边界、真实工具写入和清理。
- `src/components/Editor/Lexical/collaboration/AgentEditGuard.test.ts`：程序化修改与整篇删除的防护。
- `tests/browser/agent-writing.spec.js`：真实浏览器灰色提案、高光、输入保护、独立区域编辑、代码只读、保存隔离、完成与取消。
- 本地交互预览：启动 Vite 后打开 `/tests/browser/agent-writing.html`。预览调用实际 NotebookAgentTools，模型执行由按钮可控触发，不调用付费模型。

## 本次验证结果（2026-10-30）

- 40 个相关单元测试文件、251 项测试通过（Agent 工具/session、Lexical、代码与 Hybrid 编辑器）。
- 2 项 Playwright 浏览器场景通过，包括跨 cell 删除拦截、未锁定区域编辑、草稿不入库、动画和减少动态效果、提交后用户光标保持、代码冻结与恢复。
- Agent 服务测试 19 项通过、10 项按现有条件跳过；Agent TypeScript 检查通过。
- 新增核心模块 ESLint、`git diff --check`、生产构建通过。
- 全项目 TypeScript 检查仍有改动前已存在的错误，本次与初始错误清单一致。
- 扩大检查时发现现有 `notebookStore.identity.test.ts` 的 Hybrid→Code 输出保留测试失败；禁用本次写入保护后仍复现，未扩大范围修改它。
- 未调用真实付费模型；验证覆盖实际工具执行与编辑器集成，模型是否逐次发送草稿由其工具调用决定。

## Markdown 渲染一致性修正

- 根因：提案和草稿曾直接输出普通字符串，绕过正文 Markdown 解析，并使用独立字体。
- `model/NotebookContent.ts` 统一拥有正文和预览的内容扩展：格式、HTML、表格、代码围栏、图片、公式与分栏。
- `components/NotebookMarkdownPreview.tsx` 使用同一 `createNotebookExtension`、cell 构造和主题，在独立只读 Lexical 实例中解析；不安装正文 session，不写入 store 或正文撤销栈。
- Agent 装饰只叠加灰色和文字高光，不改变正文排版；行内代码保留其背景和可读性。长草稿按文档展开，光标根据渲染后的末尾文字定位。
- 浏览器对照同一 Markdown 提交前后的标题、强调、链接、列表、表格、代码与公式结构，以及字体、字号、行高、间距；同时检查预览只读且不进入保存内容。
- 本轮 251 项相关单元测试、3 项浏览器测试通过；ESLint、生产构建通过。全项目 TypeScript 错误清单与原有基线一致。

## 在既有 Markdown cell 内插入内容

`propose_cell_edit` 与 `update_cell` 共用可选的 `insertion` 定位参数；省略时保持原来的整 cell 替换行为。插入时 `draft` / `content` 只传新增片段，系统保留原文所有字符，不自动补空格或换行。

```json
{
  "cellId": "method",
  "version": "read_cell 返回的版本",
  "insertion": { "anchor": "当前方法说明，", "position": "after" },
  "content": "**新增论证**与 $x^2$，"
}
```

- 支持唯一原文锚点之前或之后插入，包括段落内部和段落之间；定位使用 Markdown 源文，不是渲染后的纯文本。
- `CellContentEdit` 统一解析定位并组合预览和提交结果；预览展示完整上下文，提交保留原 cell ID 和 Markdown 类型。
- 版本不匹配、锚点不存在、多次出现、非 Markdown cell 或组合结果超限时拒绝写入，不猜测位置。
- 插入期间仍冻结整个 cell；尚不支持同一 cell 的局部锁及人和 Agent 同时修改不同范围。
- 本轮 59 项相关单元测试、4 项浏览器测试通过；服务端类型检查通过，前端类型检查与既有错误基线一致。

## Conversation and article surfaces

The demand sidebar owns user prompts, Agent replies, approvals, and execution details. The Lexical document contains article content and position-bound writing previews only. `NotebookDocumentProjection` defines this boundary for initial loading and external synchronization. Reconciliation preserves notebook-owned conversation records when the author edits, deletes, or restores article content. Conversation records continue to use the canonical notebook persistence and execution identity; there is no second message store.

`showNotebookConversation` selects the conversation and opens the demand tab. Command-bar submission and Agent insertion use this same destination. Existing persisted Agent records remain available in the sidebar without appearing as editable article blocks. Long user requests are expandable; all conversation turns remain readable.

Long writing tasks first create a bounded outline, then publish intent and draft checkpoints before committing Markdown. These are tool-call checkpoints, not model-token streaming.

### Outline-first authoring

For multi-section writing, the standard Notebook skill first commits a heading and scope sentence into a separate Markdown cell for each section. The agent then expands these stable cell IDs in order: read/version → planned proposal → writing draft checkpoints → commit/read-back. All pending outline nodes are gray, read-only reservations created with `outline:true`. Only the active section displays a collaborator caret; waiting sections display just their gray heading. Each commit releases its own reservation and restores normal article typography. Cancellation or run termination releases remaining reservations. A live three-section AAL walkthrough verified this sequence, including two successive drafts in the first section and unchanged IDs after expansion. Captures include the initial outline, the active editing animation, and subsequent section proposals.


Draft presentation uses a Unicode-aware progressive playback clock. Appended checkpoints retain the visible prefix; corrected drafts restart at their common prefix. Commits await an attached presentation before applying and recheck notebook ownership/version afterwards. This is a frontend typing effect over received tool-call drafts, not token streaming from the model. Markdown re-parsing assigns the elapsed shine delay to replacement text nodes so typing does not restart the highlight animation.

The document surface displays only draft content and the collaborator caret. Tool intents and lock/status sentences are not rendered as article annotations. The demand panel uses a single @Agent identity in its conversation header; multiple conversations can be selected in that same header.
