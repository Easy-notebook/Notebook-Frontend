/** AAL uses brace interpolation and a smaller escape alphabet than JSON. */
function literal(value: string): string {
  let escaped = '';
  for (const char of value) {
    const n = char.codePointAt(0)!;
    if (
      (n < 32 && !'\n\r\t\0'.includes(char)) ||
      (n >= 127 && n <= 159) ||
      (n >= 0xd800 && n <= 0xdfff)
    )
      throw new Error('特征名包含不支持的控制字符');
    escaped +=
      (
        {
          '\\': '\\\\',
          '"': '\\"',
          '{': '{{',
          '}': '}}',
          '\n': '\\n',
          '\r': '\\r',
          '\t': '\\t',
          '\0': '\\0',
        } as Record<string, string>
      )[char] ?? char;
  }
  return `"${escaped}"`;
}

function groupingSource(
  version: string,
  columns: readonly string[],
  clusters: number,
  additionalSkill = '',
  evidence = false
): string {
  if (!/^[a-f0-9]{64}$/.test(version)) throw new Error('无效的 CSV 文件版本');
  if (!Number.isInteger(clusters) || clusters < 2 || clusters > 16)
    throw new Error('分群数量必须为 2 至 16');
  if (
    !columns.length ||
    columns.length > 16 ||
    new Set(columns).size !== columns.length ||
    columns.some((column) => !column.length || new TextEncoder().encode(column).length > 256)
  )
    throw new Error('请选择 1 至 16 个不重复的数值特征');
  return `agent Cell is Agent
${evidence ? '  memory scope "sample" strict\n    study_sample: Any\n' : ''}  private
    skill notebook_csv
      "Read an immutable CSV version owned by this notebook"
    skill numeric_segments
      "Group explicit housing features with native Rust numerical code"
${additionalSkill}  public
    ability run() -> Any effects(skill${evidence ? ', memory.read, memory.write' : ''})
      version = "${version}"
      csv = self.skill("notebook_csv", version)
      report = self.skill("numeric_segments", csv, [${columns.map(literal).join(', ')}], ${clusters})
`;
}

export function datasetCellSource(
  version: string,
  columns: readonly string[],
  clusters: number
): string {
  return (
    groupingSource(version, columns, clusters) +
    `      return {dataset_version: version, features: report.model.features, groups: report.clusters, silhouette: report.mean_silhouette}
`
  );
}

function comparisonSource(
  referenceVersion: string,
  queryVersion: string,
  columns: readonly string[],
  clusters: number,
  neighbors: number,
  evidence: boolean,
  queryRow = 0
): string {
  if (!/^[a-f0-9]{64}$/.test(queryVersion)) throw new Error('无效的查询 CSV 文件版本');
  if (!Number.isInteger(neighbors) || neighbors < 1 || neighbors > 8)
    throw new Error('每行近邻数量必须为 1 至 8');
  return (
    groupingSource(
      referenceVersion,
      columns,
      clusters,
      `    skill segment_compare
      "Explain measured neighbors against the frozen reference model"
${
  evidence
    ? `    skill notebook_sample_evidence
      "Project measured sample values and the shared housing evidence rule"
`
    : ''
}`,
      evidence
    ) +
    `      query_version = "${queryVersion}"
      query = self.skill("notebook_csv", query_version)
      comparison = self.skill("segment_compare", report.model, csv, query, ${neighbors}, report.reference_id)
${evidence ? sampleEvidenceSource(queryRow) : ''}      return {reference_version: version, query_version: query_version, comparison: comparison${evidence ? ', sample_evidence: sample_evidence' : ''}}
`
  );
}

/** Execute the same fact definitions and domain rule used by the native study workspace. */
const sampleEvidenceSource = (
  queryRow: number
) => `      projected = self.skill("notebook_sample_evidence", comparison, ${queryRow})
      memory.store("study_sample", projected.observation)
      facts = []
      for definition in projected.facts
        id = knowledge.fact("practice", "Measured values from these pinned housing CSV versions", definition.atom, definition.predicate)
        facts.append(knowledge.get(id))
      answers = knowledge.reason("inference", "Returned neighbor shares the query cluster in the frozen reference; no causal, price or algorithm-correctness claim", [projected.rule], projected.goal, 8)
      graphs = []
      for answer in answers
        graphs.append(knowledge.explain(answer.id))
      sample_evidence = {observation: projected.observation, facts: facts, answers: answers, graphs: graphs}
`;

export function comparisonCellSource(
  referenceVersion: string,
  queryVersion: string,
  columns: readonly string[],
  clusters: number,
  neighbors: number
): string {
  return comparisonSource(referenceVersion, queryVersion, columns, clusters, neighbors, false);
}

/** Selected-query proof is computed from the cell's fresh comparison, never copied from panel state. */
export function evidenceCellSource(
  referenceVersion: string,
  queryVersion: string,
  columns: readonly string[],
  clusters: number,
  neighbors: number,
  queryRow = 0
): string {
  if (!Number.isInteger(queryRow) || queryRow < 0 || queryRow > 127)
    throw new Error('证据样本行必须为 0 至 127 的整数');
  return comparisonSource(
    referenceVersion,
    queryVersion,
    columns,
    clusters,
    neighbors,
    true,
    queryRow
  );
}

/** A reference fit is committed once and reused by later query cells in this notebook. */
export function comparisonWorkflowSources(
  referenceVersion: string,
  queryVersion: string,
  columns: readonly string[],
  clusters: number,
  neighbors: number,
  binding: string
): [string, string] {
  comparisonCellSource(referenceVersion, queryVersion, columns, clusters, neighbors);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(binding)) throw new Error('无效的共享结果名称');
  const fit =
    groupingSource(
      referenceVersion,
      columns,
      clusters,
      `    skill notebook_set
      "Commit reusable reference data after successful cell completion"
`
    ) +
    `      self.skill("notebook_set", "${binding}", {version: version, model: report.model, reference_id: report.reference_id})
      return {reference_version: version, shared_value: "${binding}", groups: report.clusters}
`;
  const compare = `agent Cell is Agent
  private
    skill notebook_get
      "Read the latest successfully committed reference in this notebook"
    skill notebook_csv
      "Read exact CSV versions owned by this notebook"
    skill segment_compare
      "Explain neighbors using the saved fitted model"
  public
    ability run() -> Any effects(skill)
      reference = self.skill("notebook_get", "${binding}")
      csv = self.skill("notebook_csv", reference.version)
      query = self.skill("notebook_csv", "${queryVersion}")
      comparison = self.skill("segment_compare", reference.model, csv, query, ${neighbors}, reference.reference_id)
      return {reference_version: reference.version, query_version: "${queryVersion}", comparison: comparison}
`;
  return [fit, compare];
}
