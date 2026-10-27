import { z } from 'zod';

const id = z.string().min(1);
const index = z.number().int().nonnegative();
const status = z.enum(['candidate', 'supported', 'refuted', 'stale']);
const atom = z.object({
  relation: id,
  terms: z
    .array(z.object({ literal: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]) }))
    .max(16),
});
const claim = z
  .object({
    id,
    status,
    text: z.string(),
    atom,
    source: z.object({ agent: id, invocation: id, call_id: id }),
    premises: z
      .array(
        z.object({ id, status, assessment_revision: index, current_revision: index }).passthrough()
      )
      .max(32),
  })
  .passthrough();
const answerAtom = z.object({
  relation: z.literal('housing_same_segment_neighbor'),
  terms: z.tuple([
    z.object({ literal: id }),
    z.object({ literal: index }),
    z.object({ literal: id }),
    z.object({ literal: index }),
    z.object({ literal: index }),
    z.object({ literal: index }),
    z.object({ literal: z.number().finite().nonnegative() }),
  ]),
});

/** Read-only Rust projection. Shape/link checks do not re-prove the native certificate. */
export const sampleEvidence = z
  .object({
    current: z.boolean(),
    observation: z
      .object({ query_data_id: id, reference_id: id, query_row: index, cluster: index })
      .passthrough(),
    facts: z.array(claim).min(1).max(9),
    answers: z.array(z.object({ id, atom: answerAtom }).passthrough()).max(8),
    graphs: z.array(z.object({ root: id, nodes: z.record(id, claim) })).max(8),
  })
  .passthrough()
  .superRefine((evidence, ctx) => {
    const fail = () =>
      ctx.addIssue({ code: 'custom', message: 'Inconsistent native sample evidence links' });
    if (
      new Set(evidence.facts.map((fact) => fact.id)).size !== evidence.facts.length ||
      new Set(evidence.answers.map((answer) => answer.id)).size !== evidence.answers.length ||
      new Set(evidence.graphs.map((graph) => graph.root)).size !== evidence.graphs.length ||
      evidence.graphs.length !== evidence.answers.length
    )
      fail();
    for (const answer of evidence.answers) {
      const terms = answer.atom.terms;
      const graph = evidence.graphs.find((item) => item.root === answer.id);
      const root = graph?.nodes[answer.id];
      if (
        !graph ||
        !root ||
        JSON.stringify(root.atom) !== JSON.stringify(answer.atom) ||
        terms[0].literal !== evidence.observation.query_data_id ||
        terms[1].literal !== evidence.observation.query_row ||
        terms[2].literal !== evidence.observation.reference_id ||
        terms[4].literal !== evidence.observation.cluster
      ) {
        fail();
        continue;
      }
      if (Object.keys(graph.nodes).length > 64) fail();
      for (const [key, node] of Object.entries(graph.nodes)) {
        if (key !== node.id || node.premises.some((premise) => !graph.nodes[premise.id])) fail();
      }
    }
  });
export type SampleEvidence = z.infer<typeof sampleEvidence>;
export type EvidenceClaim = z.infer<typeof claim>;
export const evidenceStatus = {
  candidate: '待验证',
  supported: '已支持',
  refuted: '已否定',
  stale: '已过期',
} as const;

export function evidenceRelation(claim: EvidenceClaim): string {
  switch (claim.atom.relation) {
    case 'housing_assigned':
      return '查询样本的分群';
    case 'housing_neighbor':
      return '参考近邻的分群与距离';
    case 'housing_same_segment_neighbor':
      return '查询与近邻属于同一分群';
    default:
      return claim.atom.relation;
  }
}

/** Saved answers retain their original identity; current status comes from the graph. */
export function sampleConclusions(evidence: SampleEvidence) {
  return evidence.answers
    .map((answer) => {
      const graph = evidence.graphs.find((item) => item.root === answer.id)!;
      const root = graph.nodes[answer.id];
      const terms = answer.atom.terms;
      return {
        id: answer.id,
        row: terms[3].literal,
        cluster: terms[4].literal,
        rank: terms[5].literal,
        distance: terms[6].literal,
        root,
        premises: root.premises.map((premise) => ({ ...premise, claim: graph.nodes[premise.id] })),
      };
    })
    .sort((a, b) => a.rank - b.rank);
}
