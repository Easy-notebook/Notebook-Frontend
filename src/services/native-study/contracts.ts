import { z } from 'zod';

const index = z.number().int().nonnegative();
const finite = z.number().finite();
const term = z.object({
  feature: z.string(),
  value: finite,
  reference_value: finite,
  standardized_difference: finite,
  squared_distance: finite,
});
const neighbor = z.object({
  row: index,
  cluster: index,
  distance_squared: finite,
  terms: z.array(term),
});
const comparison = z
  .object({
    reference_id: z.string(),
    query_data_id: z.string(),
    rows: z.array(
      z.object({
        assignment: z.object({ row: index, cluster: index }),
        neighbors: z.array(neighbor),
      })
    ),
  })
  .passthrough();
const report = z
  .object({
    reference_id: z.string(),
    inertia: finite,
    mean_silhouette: finite,
    clusters: z.array(
      z.object({ cluster: index, count: index, representative_row: index, center: z.array(finite) })
    ),
    model: z.object({ features: z.array(z.object({ name: z.string() })) }).passthrough(),
  })
  .passthrough();
export const nativeView = z
  .object({
    frontend_notebook_id: z.string(),
    document: z
      .object({
        id: z.string().min(1),
        revision: index,
        notebook: z.object({ status: z.string() }).passthrough(),
      })
      .passthrough(),
    model_enabled: z.boolean(),
    generated_selection_enabled: z.boolean().optional(),
    study: z
      .object({
        input: z
          .object({
            revision: index,
            configuration: z
              .object({ kind: z.string(), csv: z.string(), parameters: z.unknown() })
              .passthrough(),
          })
          .nullable(),
        current: z.boolean(),
        result: z.object({ kind: z.literal('mining'), report }).nullable(),
        comparison: comparison.nullable(),
        practice: z.unknown(),
        sample_evidence: z.unknown(),
      })
      .passthrough(),
    study_selection: z
      .object({
        plan: z.object({ title: z.string() }).passthrough(),
        adoption: z
          .object({ deployment: z.string(), fingerprint: z.string(), maximum: finite })
          .passthrough(),
        execution: z
          .object({
            checked_cases: index,
            failures: z.array(z.unknown()),
            selection: z.array(z.object({ query_row: index, selected_rows: z.array(index) })),
          })
          .passthrough(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();
export type NativeView = z.infer<typeof nativeView>;
export const pendingCommand = z
  .object({
    workspace: z.string().min(1),
    ability: z.enum([
      'configure_study',
      'run_study',
      'compare_study',
      'explain_study_sample',
      'select_study',
    ]),
    arguments: z.record(z.string(), z.unknown()),
    invocation: z.string().min(1).max(128),
  })
  .strict();
export type PendingCommand = z.infer<typeof pendingCommand>;
export type StudyAbility = PendingCommand['ability'];
