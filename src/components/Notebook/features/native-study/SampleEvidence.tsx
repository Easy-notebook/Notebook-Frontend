import {
  evidenceStatus,
  evidenceRelation,
  sampleConclusions,
  type EvidenceClaim,
  type SampleEvidence as Evidence,
} from '@Services/native-study/sampleEvidence';

function ClaimSource({ claim }: { claim: EvidenceClaim }) {
  return (
    <dl className="text-xs break-all space-y-1">
      <dt>事实编号</dt>
      <dd>{claim.id}</dd>
      <dt>来源 Agent</dt>
      <dd>{claim.source.agent}</dd>
      <dt>调用编号</dt>
      <dd>{claim.source.invocation}</dd>
      <dt>步骤编号</dt>
      <dd>{claim.source.call_id}</dd>
    </dl>
  );
}

export function SampleEvidence({ evidence }: { evidence: Evidence }) {
  const conclusions = sampleConclusions(evidence);
  return (
    <section aria-label="FoKn 样本证据" className="space-y-3">
      <h3 className="font-semibold">FoKn 样本事实与推导</h3>
      <p role="status">
        {evidence.current ? '证据对应当前研究' : '历史证据已过期，请基于当前比较重新保存证据'}
      </p>
      <p>
        查询样本 {evidence.observation.query_row} · 分群 {evidence.observation.cluster}
      </p>
      <dl className="text-xs break-all">
        <dt>参考数据版本</dt>
        <dd>{evidence.observation.reference_id}</dd>
        <dt>查询数据版本</dt>
        <dd>{evidence.observation.query_data_id}</dd>
      </dl>
      <p className="text-sm text-muted-foreground">
        推导只说明返回的近邻与查询样本在同一冻结参考中属于同一分群，不证明房价、因果关系或算法正确性。
        状态来自 Rust 内核；此视图不提供独立的证明验证。行号和近邻序号从零开始。
      </p>
      <h4>同群近邻推导（{conclusions.length}）</h4>
      {conclusions.length === 0 && <p>没有返回同群近邻推导；这不表示不存在其他相似样本。</p>}
      {conclusions.map((item) => (
        <details key={item.id} className="border rounded p-2">
          <summary>
            参考行 {item.row} · 分群 {item.cluster} · {evidenceStatus[item.root.status]}
          </summary>
          <p>
            近邻序号 {item.rank} · 标准化距离平方 {item.distance.toPrecision(6)}
          </p>
          <p>规则：查询分群事实与近邻分群事实匹配同一查询、参考版本和分群。</p>
          <h5>依赖事实</h5>
          <ul className="space-y-3">
            {item.premises.map((premise) => (
              <li key={premise.id}>
                <p>
                  {evidenceRelation(premise.claim)} · {evidenceStatus[premise.claim.status]}
                </p>
                <p>
                  引用评估修订 {premise.assessment_revision} · 当前修订 {premise.current_revision}
                </p>
                <ClaimSource claim={premise.claim} />
              </li>
            ))}
          </ul>
          <details>
            <summary>推导来源</summary>
            <ClaimSource claim={item.root} />
          </details>
        </details>
      ))}
      <details>
        <summary>测量事实（{evidence.facts.length}）</summary>
        <ul className="space-y-3">
          {evidence.facts.map((fact) => (
            <li key={fact.id}>
              <p>
                {evidenceRelation(fact)} · {evidenceStatus[fact.status]}
              </p>
              <p className="text-xs break-all">
                {fact.atom.terms.map((term) => JSON.stringify(term.literal)).join(' · ')}
              </p>
              <ClaimSource claim={fact} />
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>完整证据 JSON</summary>
        <pre className="text-xs overflow-auto max-h-64">{JSON.stringify(evidence, null, 2)}</pre>
      </details>
    </section>
  );
}
