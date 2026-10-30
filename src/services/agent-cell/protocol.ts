import { documentToolSchemas, documentToolDescriptions } from './documentProtocol';
import { z } from 'zod';
import { curationSchema } from '../notebook-context/model';
export type AgentRole = 'worker' | 'curator';

export const providerSchema = z.enum(['codex', 'claude']);
export type AgentProvider = z.infer<typeof providerSchema>;
const id = z.string().min(1).max(200);
export const cellInsertionSchema = z
  .object({
    anchor: z.string().min(1).max(500_000),
    position: z.enum(['before', 'after']),
  })
  .strict();
export type CellInsertion = z.infer<typeof cellInsertionSchema>;
export const toolSchemas = {
  ...documentToolSchemas,
  read_context: z
    .object({
      path: z.string().max(300).optional(),
      offset: z.number().int().nonnegative().optional(),
    })
    .strict(),
  curate_context: curationSchema,
  list_cells: z.object({}).strict(),
  read_cell: z.object({ cellId: id }).strict(),
  propose_cell_edit: z
    .object({
      cellId: id,
      version: id,
      intent: z.string().min(1).max(2000),
      draft: z.string().max(500_000).optional(),
      stage: z.enum(['planned', 'writing']).optional(),
      insertion: cellInsertionSchema.optional(),
    })
    .strict(),
  cancel_cell_edit: z.object({ cellId: id }).strict(),
  update_cell: z
    .object({
      cellId: id,
      version: id,
      content: z.string().max(500_000),
      insertion: cellInsertionSchema.optional(),
    })
    .strict(),
  run_cell: z.object({ cellId: id, version: id }).strict(),
  summary: z
    .object({ text: z.string().min(1).max(16_000), cellIds: z.array(id).max(256) })
    .strict(),
};
export type ToolName = keyof typeof toolSchemas;
export const toolDescriptions: Record<ToolName, string> = {
  ...documentToolDescriptions,
  read_context:
    'Read durable notebook context: original starting points, captured facts, leads, evidence sources, current summary and folder index. Pass an exact path from the index for Markdown evidence. Large files are chunked: continue with nextOffset until it is null. Read before every curation.',
  curate_context:
    'Curator-only atomic update of readable context documents. Use the version from read_context. Cite existing evidence IDs, distinguish evidence from inference, preserve original quotes and starting points. Only lead statuses may change; explain changes. Never invent evidence.',
  list_cells:
    'Read the current ordered notebook index: one cell per document line, with 1-based lineNumber, single-line preview and version. Includes all cells. This is not a detail read; call read_cell before proposing or changing any existing cell.',
  read_cell:
    'Read full current cell source, outputs, version, documentLineNumber and internal lines [{lineNumber,text}] numbered from 1. content is lossless source; line labels are metadata, never write them into content. Required before proposing or modifying this cell, including batch updates, moves or removals. Re-read after source changes.',
  propose_cell_edit:
    'Before composing a cell replacement, read_cell then declare its version and a short writing intent in the document. This reserves the entire cell until update_cell, cancel_cell_edit or run end. Use stage planned for a static gray proposal, writing (default) while generating. Optional draft previews work without saving it. Repeating updates your own proposal. Never reserve unrelated cells. For insertion within a Markdown cell, pass insertion with an exact unique source anchor and position before/after; draft contains only the new fragment. Include desired whitespace/newlines explicitly. Use the same insertion with update_cell.',
  cancel_cell_edit:
    'Release your cell writing proposal without changing document content. Use when abandoning an edit.',
  update_cell:
    'Replace the content of an editable text/code cell only if version still matches. Returns the new version. To insert inside a Markdown cell without replacing existing text, pass insertion {anchor, position: before/after}; content is only the inserted fragment. Anchor must occur exactly once in the read source. Whitespace/newlines are preserved exactly; include them in content. Omit insertion only for whole-cell replacement.',
  run_cell:
    'Execute a code cell through the notebook kernel only if version matches. Waits for the execution result.',
  summary:
    'Save a concise task summary: objective, findings, changed cells, execution evidence and remaining work. This persists a handoff, does not erase history. cellIds must refer to existing notebook cells.',
};
export const toolNameSchema = z.enum([
  'read_notebook',
  'backup_notebook',
  'apply_notebook_edits',
  'save_notebook_copy',
  'flush_notebook',
  'list_notebook_files',
  'read_notebook_file',
  'read_context',
  'curate_context',
  'list_cells',
  'read_cell',
  'update_cell',
  'propose_cell_edit',
  'cancel_cell_edit',
  'run_cell',
  'summary',
]);
export const runRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    runId: z.string().uuid(),
    notebookId: id,
    cellId: id,
    notebookAgentId: z.string().min(1).max(512).optional(),
    sourceSessionId: z.string().uuid().optional(),
    provider: providerSchema,
    role: z.enum(['worker', 'curator']).optional(),
    intent: z.literal('regenerate').optional(),
    prompt: z.string().min(1).max(64_000),
    context: z.string().max(1_000_000),
  })
  .strict();
export type RunRequest = z.infer<typeof runRequestSchema>;
export const executionSpanSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().optional(),
  runtime: z.enum(['aal', 'model', 'notebook', 'eal']),
  name: z.string(),
  status: z.enum(['queued', 'waiting', 'running', 'done', 'failed', 'stopped']),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  invocation: z.string().optional(),
  error: z.string().optional(),
});
export type ExecutionSpan = z.infer<typeof executionSpanSchema>;
export const usageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
});
export const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool'),
    callId: z.string().uuid(),
    name: toolNameSchema,
    arguments: z.unknown(),
  }),
  z.object({
    type: z.literal('activity'),
    id: z.string(),
    label: z.string(),
    status: z.string(),
    detail: z.string().optional(),
  }),
  z.object({ type: z.literal('usage'), usage: usageSchema }),
  z.object({ type: z.literal('span'), span: executionSpanSchema }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type AgentEvent = z.infer<typeof eventSchema>;
export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}
export const toolReplySchema = z
  .object({
    runId: z.string().uuid(),
    callId: z.string().uuid(),
    result: z
      .object({ ok: z.boolean(), data: z.unknown().optional(), error: z.string().optional() })
      .strict(),
  })
  .strict();
export type AgentPhase = 'idle' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed';
export interface AgentAction {
  id: string;
  name: string;
  status: string;
  arguments?: unknown;
  result?: unknown;
  kind?: 'tool' | 'activity';
  startedAt?: number;
  endedAt?: number;
}
export interface AgentTurn {
  id: string;
  prompt: string;
  answer: string;
  actions: AgentAction[];
  status: AgentPhase;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  retryOf?: string;
  spans?: ExecutionSpan[];
  usage?: z.infer<typeof usageSchema>;
  followUps?: string[];
  feedback?: { value: 'up' | 'down'; reason?: string };
}
export interface AgentCellData {
  version: 1;
  notebookAgentId?: string;
  sourceSessionId?: string;
  sessionId: string;
  provider: AgentProvider;
  role?: AgentRole;
  turns: AgentTurn[];
  summary?: { text: string; cellIds: string[]; updatedAt: string };
}
export const DEFAULT_AGENT_PROVIDER: AgentProvider = 'codex';
export function newAgentCellData(
  provider: AgentProvider = DEFAULT_AGENT_PROVIDER,
  role: AgentRole = 'worker'
): AgentCellData {
  return { version: 1, sessionId: crypto.randomUUID(), provider, role, turns: [] };
}

export function toolsForRole(role: AgentRole = 'worker') {
  return Object.fromEntries(
    Object.entries(toolSchemas).filter(([name]) =>
      role === 'curator'
        ? ![
            'update_cell',
            'propose_cell_edit',
            'cancel_cell_edit',
            'run_cell',
            'apply_notebook_edits',
            'backup_notebook',
            'save_notebook_copy',
            'flush_notebook',
          ].includes(name)
        : name !== 'curate_context'
    )
  );
}
