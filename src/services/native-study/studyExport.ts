import type { NativeView } from './contracts';
/** Export a historical observation with identity/version; never label it as live editor state. */
export function studyMarkdown(view: NativeView): string {
  if (!view.study.current || !view.study.result) throw new Error('请先执行房屋分群研究');
  const report = view.study.result.report;
  const lines = [
    '## 房屋特征分群与相似样本解释',
    '',
    `研究快照：${view.document.id}，修订 ${view.document.revision}。`,
    `参考数据：${report.reference_id}。`,
    `分群数量：${report.clusters.length}；平均轮廓系数：${report.mean_silhouette}。`,
    '',
    '这是保存时的测量快照，后续输入变化不会自动改写本文。相似性描述所选特征，不证明房价或因果关系。',
  ];
  for (const row of view.study.comparison?.rows ?? []) {
    lines.push('', `### 查询样本 ${row.assignment.row}（分群 ${row.assignment.cluster}）`);
    for (const neighbor of row.neighbors)
      lines.push(
        `- 参考行 ${neighbor.row}：分群 ${neighbor.cluster}，标准化距离平方 ${neighbor.distance_squared}。`
      );
  }
  // JSON string escaping prevents embedded content from closing a Markdown code fence.
  const evidence = JSON.stringify(
    { study: view.study, selection: view.study_selection ?? null },
    null,
    2
  ).replace(/`/g, '\\u0060');
  lines.push('', '### 测量与证据记录', '', '```json', evidence, '```');
  return lines.join('\n');
}
