import { notebookSkillFixture } from '../skills/NotebookSkill.fixture';
import { expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ options: {} as any, id: 'original' }));
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: () => ({}),
  tool: () => ({}),
  query: ({ options }: any) => {
    mocks.options = options;
    const stream = (async function* () {
      yield { type: 'system', session_id: mocks.id };
      yield {
        type: 'result',
        session_id: mocks.id,
        is_error: false,
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    })();
    return Object.assign(stream, { close: () => {} });
  },
}));
import { ClaudeRuntime } from './ClaudeRuntime';
beforeEach(() => {
  mocks.id = 'original';
});
const run = () => ({
  prompt: 'continue',
  notebookSkill: notebookSkillFixture(),
  session: { threadId: 'original', sourceSessionId: 'original', cwd: '/project' },
  signal: new AbortController().signal,
  emit: vi.fn(),
  call: vi.fn(),
});
it('resumes original Claude session in its project with notebook tools only', async () => {
  await new ClaudeRuntime().run(run());
  expect(mocks.options).toMatchObject({
    resume: 'original',
    cwd: '/project',
    tools: [],
    persistSession: true,
  });
  expect(mocks.options.mcpServers).toHaveProperty('notebook');
});
it('rejects silent replacement of the source session', async () => {
  mocks.id = 'replacement';
  await expect(new ClaudeRuntime().run(run())).rejects.toThrow('identity mismatch');
});
