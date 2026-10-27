import { z } from 'zod';
export const contextRoot = 'notebook-context';
export const statePath = `${contextRoot}/state.json`;
export const entryKindSchema = z.enum(['origin', 'fact', 'lead']);
export type EntryKind = z.infer<typeof entryKindSchema>;
export const kindLabels: Record<EntryKind, string> = {
  origin: '出发点',
  fact: '关键事实',
  lead: '线索',
};
export const kindFolders: Record<EntryKind, string> = {
  origin: '00-origins',
  fact: '10-facts',
  lead: '20-leads',
};
const uuid = z.string().uuid();
export const sourceSchema = z.object({
  id: uuid,
  notebookId: z.string().min(1),
  cellId: z.string().optional(),
  conversationId: z.string(),
  messageId: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(200_000),
  capturedAt: z.string(),
});
export type ContextSource = z.infer<typeof sourceSchema>;
export type SourceIdentity = Pick<
  ContextSource,
  'notebookId' | 'cellId' | 'conversationId' | 'messageId' | 'role'
>;
const entrySchema = z.object({
  id: uuid,
  kind: entryKindSchema,
  title: z.string().min(1).max(160),
  sourceId: uuid,
  quote: z.string().min(1).max(16_000),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  note: z.string().max(8000),
  status: z.enum(['open', 'resolved', 'superseded']),
  relatedIds: z.array(uuid).max(100),
  createdAt: z.string(),
});
export type ContextEntry = z.infer<typeof entrySchema>;
export const curationSchema = z
  .object({
    expectedVersion: z.string().min(1),
    overview: z.string().min(1).max(16_000),
    startingPoint: z.string().min(1).max(8000),
    openQuestions: z.string().max(8000),
    nextSteps: z.string().max(8000),
    references: z.array(uuid).max(1000),
    annotations: z
      .array(
        z
          .object({
            id: uuid,
            note: z.string().max(8000),
            relatedIds: z.array(uuid).max(100),
            status: z.enum(['open', 'resolved', 'superseded']),
          })
          .strict()
      )
      .max(1000),
  })
  .strict();
export type ContextCuration = z.infer<typeof curationSchema>;
export const knowledgeSchema = z.object({
  schemaVersion: z.literal(1),
  notebookId: z.string().min(1),
  version: z.string(),
  revision: z.number().int().nonnegative(),
  sources: z.array(sourceSchema),
  entries: z.array(entrySchema).max(1000),
  curation: curationSchema
    .omit({ expectedVersion: true, annotations: true })
    .extend({ updatedAt: z.string(), basedOnRevision: z.number() })
    .nullable(),
  history: z.array(
    z.object({
      revision: z.number(),
      at: z.string(),
      actor: z.enum(['user', 'curator']),
      change: z.string(),
      snapshot: z.string(),
    })
  ),
});
export type NotebookKnowledge = z.infer<typeof knowledgeSchema>;
export function emptyKnowledge(notebookId: string): NotebookKnowledge {
  return {
    schemaVersion: 1,
    notebookId,
    version: 'empty',
    revision: 0,
    sources: [],
    entries: [],
    curation: null,
    history: [],
  };
}
export function entryPath(entry: ContextEntry) {
  return `${contextRoot}/${kindFolders[entry.kind]}/${entry.id}.md`;
}
export const quoted = (text: string) =>
  text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
const label = (text: string) => text.replace(/[[\]\\\n\r]/g, ' ');
const relativeEntry = (entry: ContextEntry) => `${kindFolders[entry.kind]}/${entry.id}.md`;

/** Canonical evidence is immutable; agent curation is a separate, versioned interpretation. */
export class NotebookKnowledgeDocument {
  readonly value: NotebookKnowledge;
  constructor(value: NotebookKnowledge) {
    this.value = knowledgeSchema.parse(value);
    const sourceIds = new Set<string>();
    for (const source of this.value.sources) {
      if (source.notebookId !== value.notebookId || sourceIds.has(source.id))
        throw new Error('Invalid source ownership');
      sourceIds.add(source.id);
    }
    const ids = new Set(this.value.entries.map((entry) => entry.id));
    if (ids.size !== this.value.entries.length) throw new Error('Duplicate context entry');
    for (const entry of this.value.entries) {
      const source = this.value.sources.find((source) => source.id === entry.sourceId);
      if (
        !source ||
        source.text.slice(entry.start, entry.end) !== entry.quote ||
        entry.start >= entry.end ||
        entry.end > source.text.length
      )
        throw new Error('Quote no longer matches its source snapshot');
      if (entry.relatedIds.some((id) => !ids.has(id))) throw new Error('Unknown related entry');
    }
    if (this.value.curation?.references.some((id) => !ids.has(id)))
      throw new Error('Unknown context reference');
  }
  capture(
    source: ContextSource,
    kind: EntryKind,
    title: string,
    start: number,
    end: number
  ): NotebookKnowledgeDocument {
    sourceSchema.parse(source);
    if (source.notebookId !== this.value.notebookId)
      throw new Error('Source belongs to another notebook');
    const existing = this.value.sources.find(
      (item) =>
        item.conversationId === source.conversationId &&
        item.messageId === source.messageId &&
        item.role === source.role &&
        item.text === source.text &&
        item.cellId === source.cellId
    );
    const origin = existing || source;
    if (
      this.value.entries.some(
        (entry) =>
          entry.kind === kind &&
          entry.sourceId === origin.id &&
          entry.start === start &&
          entry.end === end
      )
    )
      return this;
    const entry = entrySchema.parse({
      id: crypto.randomUUID(),
      kind,
      title: title.trim(),
      sourceId: origin.id,
      quote: source.text.slice(start, end),
      start,
      end,
      note: '',
      relatedIds: [],
      status: 'open',
      createdAt: source.capturedAt,
    });
    return this.commit(
      {
        ...this.value,
        sources: existing ? this.value.sources : [...this.value.sources, origin],
        entries: [...this.value.entries, entry],
      },
      'user',
      `摘录${kindLabels[kind]}：${entry.title}`
    );
  }
  curate(input: ContextCuration): NotebookKnowledgeDocument {
    const curation = curationSchema.parse(input);
    if (curation.expectedVersion !== this.value.version)
      throw new Error('VERSION_CONFLICT: context changed; read_context again');
    const ids = new Set(this.value.entries.map((entry) => entry.id));
    if (this.value.entries.length && !curation.references.length)
      throw new Error('Curation must cite captured evidence');
    if (curation.references.some((id) => !ids.has(id)))
      throw new Error('Unknown evidence reference');
    const annotations = new Map(curation.annotations.map((item) => [item.id, item]));
    if (
      annotations.size !== curation.annotations.length ||
      [...annotations.keys()].some((id) => !ids.has(id))
    )
      throw new Error('Invalid annotation identities');
    for (const annotation of annotations.values()) {
      const entry = this.value.entries.find((entry) => entry.id === annotation.id)!;
      if (entry.kind !== 'lead' && annotation.status !== entry.status)
        throw new Error(
          'Only leads may change status; original facts and starting points remain intact'
        );
      if (annotation.relatedIds.some((id) => !ids.has(id) || id === annotation.id))
        throw new Error('Invalid evidence relationship');
      if (annotation.status !== entry.status && !annotation.note.trim())
        throw new Error('A lead status change requires an explanation');
    }
    const { overview, startingPoint, openQuestions, nextSteps, references } = curation;
    return this.commit(
      {
        ...this.value,
        entries: this.value.entries.map((entry) => {
          const note = annotations.get(entry.id);
          return note
            ? { ...entry, note: note.note, relatedIds: note.relatedIds, status: note.status }
            : entry;
        }),
        curation: {
          overview,
          startingPoint,
          openQuestions,
          nextSteps,
          references,
          updatedAt: new Date().toISOString(),
          basedOnRevision: this.value.revision,
        },
      },
      'curator',
      '整理上下文、证据关联与待验证线索'
    );
  }
  private commit(value: NotebookKnowledge, actor: 'user' | 'curator', change: string) {
    const next = { ...value, version: crypto.randomUUID(), revision: value.revision + 1 };
    const document = new NotebookKnowledgeDocument(next);
    return new NotebookKnowledgeDocument({
      ...next,
      history: [
        ...value.history,
        {
          revision: next.revision,
          at: new Date().toISOString(),
          actor,
          change,
          snapshot: document.currentMarkdown(),
        },
      ],
    });
  }
  currentMarkdown(): string {
    const { value } = this;
    const list = (kind: EntryKind) =>
      value.entries
        .filter((entry) => entry.kind === kind)
        .map(
          (entry) =>
            `### ${entry.title}\n\n${quoted(entry.quote)}\n\n来源：[原文快照](../40-sources/${entry.sourceId}.md) · [条目](../${relativeEntry(entry)})${kind === 'lead' ? ` · ${entry.status === 'open' ? '待验证' : entry.status === 'resolved' ? '已解决' : '已被替代'}` : ''}\n${entry.note ? `\n整理说明：${entry.note}\n` : ''}`
        )
        .join('\n\n') || '尚未摘录。';
    const summary = value.curation;
    return `# 当前上下文\n\n版本 ${value.revision} · ${summary && value.revision > summary.basedOnRevision + 1 ? '有新摘录，整理摘要待更新。' : '以下原始摘录为上下文依据。'}\n\n## 出发点（原始记录）\n\n${list('origin')}\n\n## 关键事实（用户选定的证据，未自动判定为已验证）\n\n${list('fact')}\n\n## 线索与状态\n\n${list('lead')}\n\n## 整理摘要\n\n${summary?.overview || '尚未运行上下文整理 agent。'}\n\n### 出发点解读\n\n${summary?.startingPoint || '以原始出发点为准。'}\n\n### 未决问题\n\n${summary?.openQuestions || '暂无整理记录。'}\n\n### 下一步\n\n${summary?.nextSteps || '选取聊天中的关键文字，记录证据后进行整理。'}\n\n### 整理引用\n\n${
      summary?.references
        .map((id) => {
          const entry = value.entries.find((entry) => entry.id === id)!;
          return `- [${label(entry.title)}](../${relativeEntry(entry)})`;
        })
        .join('\n') || '无。'
    }\n`;
  }
  files(): Map<string, string> {
    const files = new Map<string, string>();
    files.set(statePath, JSON.stringify(this.value, null, 2));
    files.set(
      `${contextRoot}/README.md`,
      `# Notebook 上下文档案\n\n从 [当前上下文](30-context/current.md) 开始阅读。原始证据与 agent 的整理结论分开保存。\n\n- [出发点](00-origins/index.md)：为什么开始、目标与约束。\n- [关键事实](10-facts/index.md)：从聊天选出的原文证据。\n- [线索](20-leads/index.md)：待验证方向、关联与状态。\n- [来源](40-sources/index.md)：不可变的聊天文本快照。\n- [变更记录](90-history/index.md)：每次摘录与整理的上下文版本。\n\n版本：${this.value.revision}。state.json 是结构化记录；Markdown 文件由它原子生成，请通过摘录与整理工具更新。\n`
    );
    files.set(`${contextRoot}/30-context/current.md`, this.currentMarkdown());
    for (const kind of entryKindSchema.options)
      files.set(
        `${contextRoot}/${kindFolders[kind]}/index.md`,
        `# ${kindLabels[kind]}\n\n${
          this.value.entries
            .filter((entry) => entry.kind === kind)
            .map((entry) => `- [${label(entry.title)}](${entry.id}.md)`)
            .join('\n') || '尚无记录。'
        }\n`
      );
    for (const entry of this.value.entries)
      files.set(
        entryPath(entry),
        `# ${entry.title}\n\n类型：${kindLabels[entry.kind]} · 摘录时间：${entry.createdAt}\n\n## 原始摘录\n\n${quoted(entry.quote)}\n\n[查看完整来源快照](../40-sources/${entry.sourceId}.md) · 字符范围 ${entry.start}–${entry.end}\n\n## 整理说明\n\n${entry.note || '尚未整理。'}\n\n## 状态\n\n${entry.kind === 'lead' ? entry.status : '用户选定的原文证据；不是自动验证的结论。'}\n\n## 关联\n\n${
          entry.relatedIds
            .map((id) => {
              const target = this.value.entries.find((item) => item.id === id)!;
              return `- [${label(target.title)}](../${relativeEntry(target)})`;
            })
            .join('\n') || '暂无。'
        }\n`
      );
    files.set(
      `${contextRoot}/40-sources/index.md`,
      `# 来源快照\n\n${this.value.sources.map((source) => `- [${source.role === 'user' ? '用户' : '助手'} · ${source.capturedAt}](${source.id}.md)`).join('\n') || '尚无来源。'}\n`
    );
    for (const source of this.value.sources)
      files.set(
        `${contextRoot}/40-sources/${source.id}.md`,
        `# 聊天来源快照\n\n作者：${source.role === 'user' ? '用户' : '助手'}\n\nNotebook：${source.notebookId}\n\nCell：${source.cellId || '侧栏聊天'}\n\n会话：${source.conversationId}\n\n消息：${source.messageId}\n\n截取时间：${source.capturedAt}\n\n## 原文\n\n${quoted(source.text)}\n`
      );
    files.set(
      `${contextRoot}/90-history/index.md`,
      `# 上下文变更记录\n\n${this.value.history.map((item) => `- [v${item.revision} · ${label(item.change)}](v${item.revision}.md) — ${item.actor} · ${item.at}`).join('\n') || '尚无变更。'}\n`
    );
    for (const item of this.value.history)
      files.set(
        `${contextRoot}/90-history/v${item.revision}.md`,
        `# v${item.revision} · ${item.change}\n\n${item.at} · ${item.actor}\n\n${item.snapshot}`
      );
    return files;
  }
}
