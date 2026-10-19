import { test, expect } from '@playwright/test';

test('remembered information survives reload in the existing notebook agent memory', async ({
  page,
}) => {
  await page.goto('/tests/browser/storage.html');
  await page.evaluate(async () => {
    const { RememberInformationAction } = await import(
      '/src/services/stream/actions/agent/RememberInformationAction.ts'
    );
    await new RememberInformationAction().execute({
      notebookId: 'memory-test',
      payload: {
        information: 'Use concise examples',
        category: 'preference',
        agentType: 'general',
      },
      showToast: async () => {},
    });
  });
  await page.reload();
  const memory = await page.evaluate(async () => {
    const { AgentMemoryService } = await import('/src/services/agentMemoryService.ts');
    return AgentMemoryService.prepareMemoryContextForBackend('memory-test', 'general', {})
      .agent_memory;
  });
  expect(memory.notebook_id).toBe('memory-test');
  expect(memory.situation_tracking.current_context).toHaveLength(1);
  expect(memory.situation_tracking.current_context[0]).toMatchObject({
    context_update: { information: 'Use concise examples', category: 'preference' },
    agent_type: 'general',
  });
});
