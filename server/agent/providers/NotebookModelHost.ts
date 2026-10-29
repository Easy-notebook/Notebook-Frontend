import { requiresAgentApproval } from '../../../src/services/agent-cell/AgentApprovalGate';
import { randomUUID } from 'node:crypto';
import type { AgentRuntime, ProviderRun } from './types';
import type { ExecutionSpan } from '../../../src/services/agent-cell/protocol';

/** Shared model/tool lifecycle for process-local and admitted ability Hosts. */
export class NotebookModelHost {
  constructor(private readonly model: AgentRuntime) {}
  async execute(
    run: ProviderRun,
    parent: ExecutionSpan,
    prompt = run.prompt,
    operation = 'skill.notebook_model'
  ) {
    const span: ExecutionSpan = {
      id: randomUUID(),
      parentId: parent.id,
      runtime: 'model',
      name: operation,
      status: 'running',
      startedAt: Date.now(),
      invocation: parent.invocation,
    };
    run.emit({ type: 'span', span });
    let answer = '';
    try {
      await this.model.run({
        ...run,
        prompt,
        emit: (event) => {
          if (event.type === 'text') answer += event.text;
          run.emit(event);
        },
        call: async (name, args) => {
          const tool: ExecutionSpan = {
            id: randomUUID(),
            parentId: span.id,
            runtime: 'notebook',
            name,
            status: requiresAgentApproval(name) ? 'waiting' : 'running',
            startedAt: Date.now(),
            invocation: parent.invocation,
          };
          run.emit({ type: 'span', span: tool });
          try {
            const result = await run.call(name, args, () =>
              run.emit({ type: 'span', span: { ...tool, status: 'running' } })
            );
            run.emit({
              type: 'span',
              span: {
                ...tool,
                status: result.ok ? 'done' : 'failed',
                endedAt: Date.now(),
                error: result.error,
              },
            });
            return result;
          } catch (error) {
            run.emit({
              type: 'span',
              span: {
                ...tool,
                status: run.signal.aborted ? 'stopped' : 'failed',
                endedAt: Date.now(),
                error: String(error),
              },
            });
            throw error;
          }
        },
      });
      run.signal.throwIfAborted();
      run.emit({ type: 'span', span: { ...span, status: 'done', endedAt: Date.now() } });
      return { answer };
    } catch (error) {
      run.emit({
        type: 'span',
        span: {
          ...span,
          status: run.signal.aborted ? 'stopped' : 'failed',
          endedAt: Date.now(),
          error: String(error),
        },
      });
      throw error;
    }
  }
}
