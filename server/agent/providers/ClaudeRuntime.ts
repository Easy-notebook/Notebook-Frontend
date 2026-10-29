import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import {
  toolsForRole,
  toolDescriptions,
  type ToolName,
} from '../../../src/services/agent-cell/protocol';
import { instructionsForRole, type AgentRuntime, type ProviderRun } from './types';

export class ClaudeRuntime implements AgentRuntime {
  async run(run: ProviderRun): Promise<void> {
    run.signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    run.signal.addEventListener('abort', abort, { once: true });
    const server = createSdkMcpServer({
      name: 'notebook',
      version: '1.0.0',
      tools: Object.entries(toolsForRole(run.role)).map(([name, schema]) =>
        tool(name, toolDescriptions[name as ToolName], schema.shape, async (args) => {
          const result = await run.call(name as ToolName, args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            isError: !result.ok,
          };
        })
      ),
    });
    const stream = query({
      prompt: run.prompt,
      options: {
        abortController: controller,
        resume: run.session.threadId,
        includePartialMessages: true,
        systemPrompt: instructionsForRole(run.role),
        tools: [],
        mcpServers: { notebook: server },
        allowedTools: Object.keys(toolsForRole(run.role)).map((name) => `mcp__notebook__${name}`),
        permissionMode: 'dontAsk',
        persistSession: true,
        ...(process.env.NOTEBOOK_CLAUDE_BIN
          ? { pathToClaudeCodeExecutable: process.env.NOTEBOOK_CLAUDE_BIN }
          : {}),
      },
    });
    try {
      let completed = false;
      for await (const message of stream) {
        run.signal.throwIfAborted();
        if ('session_id' in message) run.session.threadId = message.session_id;
        if (
          message.type === 'stream_event' &&
          message.event.type === 'content_block_delta' &&
          message.event.delta.type === 'text_delta'
        ) {
          run.emit({ type: 'text', text: message.event.delta.text });
        }
        if (message.type === 'result') {
          run.emit({
            type: 'usage',
            usage: {
              inputTokens:
                message.usage.input_tokens +
                (message.usage.cache_read_input_tokens ?? 0) +
                (message.usage.cache_creation_input_tokens ?? 0),
              outputTokens: message.usage.output_tokens,
            },
          });
          if (message.is_error)
            throw new Error('errors' in message ? message.errors.join('\n') : 'Claude run failed');
          completed = true;
        }
      }
      if (!completed) throw new Error('Claude stream ended without a result');
    } finally {
      run.signal.removeEventListener('abort', abort);
      stream.close();
    }
  }
}
