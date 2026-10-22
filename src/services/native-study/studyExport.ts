import type { NativeView } from './contracts';
import { studyFigureSource } from './studyFigure';
function jsonBlock(value: unknown): string[] {
  // Prevent reported text from closing a Markdown fence; JSON decoding retains exact content.
  return ['```json', JSON.stringify(value, null, 2).replace(/`/g, '\\u0060'), '```'];
}
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
  const figure = view.study.figure;
  if (figure && figure.reference_id !== report.reference_id)
    throw new Error('图表参考数据与当前研究不一致，请重新加载');
  if (figure) {
    lines.push(
      '',
      '### 房屋分群图',
      '',
      `![房屋分群图](${studyFigureSource(figure)})`,
      '',
      '二维位置使用原始特征单位；颜色来自完整拟合特征空间。投影距离不证明价格相似性或因果关系。'
    );
  }
  const evidence = figure ? { ...view.study, figure: { ...figure, svg: undefined } } : view.study;
  lines.push(
    '',
    '### 测量与证据记录',
    '',
    ...jsonBlock({ study: evidence, selection: view.study_selection ?? null })
  );
  if (view.document.messages.length) {
    lines.push(
      '',
      '### 协作者讨论（模型生成）',
      '',
      '以下为保存时的历史问答，不是测量结论；后续数据变更不会更新这些回答。',
      '',
      ...jsonBlock(view.document.messages)
    );
  }
  return lines.join('\n');
}
