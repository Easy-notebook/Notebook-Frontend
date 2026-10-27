# Notebook 上下文档案

在 Agent Cell 或右侧聊天中选择一段文字，选择「关键事实」「出发点」或「线索」，填写标题并保存。摘录保存当时显示的完整消息文本快照、选中字符范围和 notebook / cell / 会话 / 消息来源。聊天后续更新或重置不会改写该快照；助手说过的话仍然是证据来源，不会自动被标记为已经验证。

工作区左侧栏「上下文」标签中的档案提供目录／阅读切换、可追溯的 Markdown 文档和 ZIP 导出。点击「整理上下文」会创建或继续当前 notebook 的专门整理 Agent Cell，可选择 Codex 或 Claude。整理过程沿用普通 Agent Cell 的流式回答、可折叠行动、追问与取消。

## 阅读顺序与文件结构

```text
notebook-context/
  README.md                   阅读入口
  state.json                  规范化的版本、来源、条目和整理记录
  00-origins/                  原始目标、约束与出发点
  10-facts/                    用户选定的关键原文
  20-leads/                    待验证、已解决、已被替代的线索
  30-context/current.md       当前上下文、整理摘要、未决问题与下一步
  40-sources/                 不可变的聊天文本快照
  90-history/                 每次摘录/整理的上下文快照
```

条目链接到完整来源；整理摘要引用已有条目；关联链接连接事实与线索。原始出发点始终与 agent 的解读分开显示。新摘录会即时出现在当前上下文中，并将旧整理摘要标记为待更新。

文件通过现有 FileRepository 保存在本机浏览器 IndexedDB 的 notebook 文件集合中；这不是操作系统上的自动同步文件夹。保存摘录会将 notebook 标记为持久保留，避免普通缓存淘汰。清除浏览器数据仍会删除本地内容；「导出文件夹 ZIP」可导出完整目录与结构化记录。当前版本未提供 ZIP 导入、跨设备同步或后台自动整理。

## 上下文与权限

每轮 Agent Cell 请求都重新读取该 notebook 的持久上下文，携带出发点、事实、线索、整理结果和文件目录。初始摘录预览最多 400 字符；完整文件可通过 `read_context` 分页读取，不依赖可见 cell、当前聊天长度或 provider 内部历史。新会话与页面刷新仍可读取已保存档案。

- 普通 agent：可以读取上下文，沿用既有 cell 修改、执行与 `summary` 工具。
- 整理 agent：可以读取 cell 与上下文，使用 `curate_context` 更新整理结果；不能修改或运行 cell。
- `read_context({path?, offset?})`：无路径返回上下文索引；指定目录中的 Markdown 路径返回最多 64,000 字符及下一页位置。
- `curate_context`：必须携带读取到的 `expectedVersion`、摘要、出发点解读、未决问题、下一步、证据引用和条目说明。不能创建或改写原始摘录；只有线索可以改变状态，且必须说明原因。
- `summary`：保存当前 Agent Cell 的会话摘要；与持久上下文整理是两个不同操作。

角色权限在 provider 工具声明、服务端桥接和前端工具执行三层检查。会话绑定 notebook、cell、provider、角色与随机会话 ID；切换 notebook、取消或删除所属 cell 会使迟到操作失效。

## 一致性

规范状态与派生 Markdown 使用同一个 IndexedDB 事务保存，复用现有文件记录、活动统计和 notebook 所有权逻辑。写入在事务中比较旧 `state.json` 的完整内容：其他窗口或 agent 已更新时返回 `VERSION_CONFLICT`，不覆盖新证据；整理 agent 必须重新读取后再整理。普通 cell 修改与运行继续使用既有版本令牌检查。

取消阻止尚未提交的操作，不回滚已经完成的摘录或整理。存储失败不会发布成功状态；损坏或缺失内容的规范文件不会被静默重置为空档案。

## 验证

```sh
npm run agent:type-check
npm run agent:test
npx vitest run src/services/notebook-context src/services/agent-cell src/services/persistence/repositories/FileRepository.test.ts
npx playwright test tests/browser/notebook-context.spec.js tests/browser/agent-cell.spec.js
npm run build
```

浏览器测试覆盖真实 IndexedDB 摘录、来源追溯、整理工具调用、ZIP 下载、刷新后的上下文注入、并发版本冲突、事务失败回滚和取消写入。浏览器中的 provider 流是测试替身；真实 provider 登录与桥接部署方式见 [Agent Cell](AGENT_CELL.md)。
