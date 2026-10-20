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
  additionalSkill = ''
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
  private
    skill notebook_csv
      "Read an immutable CSV version owned by this notebook"
    skill numeric_segments
      "Group explicit housing features with native Rust numerical code"
${additionalSkill}  public
    ability run() -> Any effects(skill)
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

export function comparisonCellSource(
  referenceVersion: string,
  queryVersion: string,
  columns: readonly string[],
  clusters: number,
  neighbors: number
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
`
    ) +
    `      query_version = "${queryVersion}"
      query = self.skill("notebook_csv", query_version)
      comparison = self.skill("segment_compare", report.model, csv, query, ${neighbors}, report.reference_id)
      return {reference_version: version, query_version: query_version, comparison: comparison}
`
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
