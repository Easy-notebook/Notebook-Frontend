import { clusterFigure } from './studyFigure';
import { z } from 'zod';
import { sampleEvidence } from './sampleEvidence';

const index = z.number().int().nonnegative();
const finite = z.number().finite();
const boundedText = (bytes: number) =>
  z
    .string()
    .refine((text) => new TextEncoder().encode(text).length <= bytes, 'Text exceeds byte limit');
const recipient = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(256),
  aliases: z.array(z.string().min(1).max(128)),
});
const conversation = z
  .array(
    z.object({
      target_agent: z.string().min(1).max(128),
      message: boundedText(8192),
      reply: boundedText(8192),
    })
  )
  .max(128);
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
export const comparison = z
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
    model: z
      .object({ features: z.array(z.object({ name: z.string() }).passthrough()) })
      .passthrough(),
  })
  .passthrough();
const studyProcedure = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    content: boundedText(65536),
    origin: z.enum(['saved', 'observed']).optional(),
    observations: boundedText(65536).optional(),
  })
  .strict();
export const discussionInstruction = z.object({
  descriptor: z
    .object({
      name: z.literal('housing-discussion'),
      revision: z.number().int().positive(),
      content_hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .passthrough(),
  content: boundedText(65536),
});
export type DiscussionInstruction = z.infer<typeof discussionInstruction>;
export const nativeView = z
  .object({
    frontend_notebook_id: z.string(),
    document: z
      .object({
        id: z.string().min(1),
        revision: index,
        notebook: z
          .object({
            status: z.enum(['Open', 'Completed']),
            chapters: z.array(z.object({ title: boundedText(1024) }).passthrough()).max(32),
          })
          .passthrough(),
        messages: conversation,
      })
      .passthrough(),
    recipients: z
      .array(recipient)
      .min(1)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        'Duplicate collaborator IDs'
      ),
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
        figure: clusterFigure.nullable().optional(),
        result: z.object({ kind: z.literal('mining'), report }).nullable(),
        comparison: comparison.nullable(),
        practice: z.unknown(),
        sample_evidence: sampleEvidence.nullable(),
        discussion_instruction: discussionInstruction.optional(),
        procedures: z.array(studyProcedure).max(64).optional(),
        observed_procedures: z
          .array(
            studyProcedure.extend({
              origin: z.literal('observed'),
              observations: boundedText(65536),
            })
          )
          .max(64)
          .optional(),
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
      'new_chapter',
      'communication',
      'revise_discussion_instruction',
      'save_study_procedure',
      'learn_study',
      'reuse_study_procedure',
      'configure_study',
      'run_study',
      'compare_study',
      'explain_study_sample',
      'select_study',
      'auto_study_task',
    ]),
    arguments: z.record(z.string(), z.unknown()),
    invocation: z.string().min(1).max(128),
  })
  .strict();
export type PendingCommand = z.infer<typeof pendingCommand>;
export type StudyAbility = PendingCommand['ability'];

const operationCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const nativeOperation = z
  .object({
    frontend_notebook_id: z.string(),
    invocation: z.string(),
    observation: z
      .object({
        attempt: z.string().uuid(),
        workspace: z.string().min(1).max(128),
        ability: z.string().min(1).max(128),
        phase: z.enum(['running', 'succeeded', 'failed', 'interrupted']),
        completed_calls: operationCount,
        failed_calls: operationCount,
        active: z
          .object({ model: operationCount, skill: operationCount, other: operationCount })
          .strict(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type NativeObservation = NonNullable<z.infer<typeof nativeOperation>['observation']>;

/** Retained native root completion, independent of volatile operation progress. */
export const nativeCommandLookup = z
  .object({
    frontend_notebook_id: z.string(),
    workspace: z.string(),
    invocation: z.string(),
    ability: pendingCommand.shape.ability,
  })
  .and(
    z.discriminatedUnion('status', [
      z.object({
        status: z.literal('completed'),
        result: z
          .object({ id: z.string(), revision: z.number().int().nonnegative() })
          .passthrough(),
      }),
      z.object({ status: z.literal('unconfirmed'), result: z.null() }),
    ])
  );
